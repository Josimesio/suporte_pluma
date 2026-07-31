import nodemailer from "npm:nodemailer@6.9.16";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function resposta(status: number, conteudo: Record<string, unknown>) {
  return new Response(JSON.stringify(conteudo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return resposta(405, { sucesso: false, mensagem: "Método não permitido." });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return resposta(401, { sucesso: false, mensagem: "Sessão não autenticada." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clienteUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: sessao, error: erroSessao } = await clienteUsuario.auth.getUser();
    if (erroSessao || !sessao.user) {
      return resposta(401, { sucesso: false, mensagem: "Sessão inválida ou expirada." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: perfil, error: erroPerfil } = await admin
      .from("perfis_usuarios")
      .select("perfil,ativo")
      .eq("id", sessao.user.id)
      .single();
    if (erroPerfil || !perfil?.ativo || perfil.perfil !== "administrador") {
      return resposta(403, {
        sucesso: false,
        mensagem: "Somente administradores podem enviar esta confirmação.",
      });
    }

    const { email } = await req.json();
    const destinatario = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
      return resposta(400, { sucesso: false, mensagem: "E-mail do destinatário inválido." });
    }

    const { data: solicitacao } = await admin
      .from("solicitacoes_acesso")
      .select("id")
      .ilike("email", destinatario)
      .eq("status", "aprovado")
      .limit(1)
      .maybeSingle();
    if (!solicitacao) {
      return resposta(400, {
        sucesso: false,
        mensagem: "Não existe solicitação aprovada para este e-mail.",
      });
    }

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || "587");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpHost || !smtpUser || !smtpPass) {
      return resposta(500, {
        sucesso: false,
        mensagem: "Os segredos SMTP da função ainda não foram configurados.",
      });
    }

    const transporte = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporte.sendMail({
      from: `Portal Conecta <${smtpUser}>`,
      to: destinatario,
      subject: "Acesso autorizado - Portal Conecta",
      text: `Olá,

Sua solicitação de acesso ao Portal Conecta foi analisada e autorizada.

Acesse: https://sr-oracle.plumaagro.com/login.html

Caso necessário, use "Esqueci minha senha" para definir uma nova senha.

Atenciosamente,
TI - Grupo Pluma`,
      html: `<p>Olá,</p>
        <p>Sua solicitação de acesso ao <strong>Portal Conecta</strong> foi analisada e autorizada.</p>
        <p><a href="https://sr-oracle.plumaagro.com/login.html">Acessar o Portal Conecta</a></p>
        <p>Caso necessário, use <strong>Esqueci minha senha</strong> para definir uma nova senha.</p>
        <p>Atenciosamente,<br>TI - Grupo Pluma</p>`,
    });

    return resposta(200, { sucesso: true });
  } catch (erro) {
    console.error(erro);
    return resposta(500, {
      sucesso: false,
      mensagem: "Não foi possível enviar o e-mail de confirmação.",
    });
  }
});
