(function(){
  "use strict";
  let graficoAcessos=null,graficoStatus=null;

  const escapar=v=>{const e=document.createElement("div");e.textContent=v==null?"":String(v);return e.innerHTML};
  const dataLocal=v=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"-";
  const inicioPeriodo=()=>{const dias=Number(document.getElementById("periodoAnalytics").value);if(!dias)return null;const d=new Date();d.setDate(d.getDate()-dias);return d.toISOString()};
  const noPeriodo=(valor,inicio)=>!inicio||new Date(valor)>=new Date(inicio);
  const chaveDia=v=>new Date(v).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"});
  const duracaoMs=(inicio,fim)=>inicio&&fim?Math.max(0,new Date(fim)-new Date(inicio)):null;
  function tempoHumano(ms){if(ms==null)return"Pendente";const min=Math.round(ms/60000);if(min<60)return`${min} min`;const h=Math.floor(min/60),m=min%60;if(h<24)return`${h}h ${m}min`;const d=Math.floor(h/24),rh=h%24;return`${d}d ${rh}h`}
  function msg(t,tipo="info"){const e=document.getElementById("mensagemAnalytics");e.className=`alert alert-${tipo} py-2`;e.textContent=t}
  function mapaContagem(lista,chave){const m=new Map();lista.forEach(x=>{const k=chave(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x)});return m}

  async function carregarAnaliticoPortal(){
    const autorizado=await protegerPaginaAdminAcessos("index.html");if(!autorizado)return;
    msg("Atualizando indicadores...","info");
    try{
      const sb=await obterClienteSupabase(),inicio=inicioPeriodo();
      let qAcessos=sb.from("acessos_portal").select("usuario_id,usuario_email,usuario_nome,perfil,pagina,titulo_pagina,acessado_em").order("acessado_em",{ascending:false}).range(0,9999);
      let qSolic=sb.from("solicitacoes_analitico").select("id,solicitante_id,solicitante_email,solicitante_nome,numero_sr,ano,status,criado_em,atendimento_iniciado_em,atendido_por,respondido_em,respondido_por").order("criado_em",{ascending:false}).range(0,9999);
      if(inicio){qAcessos=qAcessos.gte("acessado_em",inicio);qSolic=qSolic.gte("criado_em",inicio)}
      const [ra,rs,rp]=await Promise.all([qAcessos,qSolic,sb.from("perfis_usuarios").select("id,nome,email,perfil")]);
      if(ra.error)throw new Error(`Acessos: ${ra.error.message}`);if(rs.error)throw new Error(`Solicitações: ${rs.error.message}`);if(rp.error)throw new Error(`Usuários: ${rp.error.message}`);
      renderizar(ra.data||[],rs.data||[],rp.data||[],inicio);
      msg("Indicadores atualizados com dados protegidos pelo Supabase.","success");
    }catch(e){console.error(e);msg(`Não foi possível carregar o analítico: ${e.message}`,"danger")}
  }

  function renderizar(acessos,solicitacoes,perfis,inicio){
    const usuarios=new Set(acessos.map(x=>x.usuario_id));
    const respondidas=solicitacoes.filter(x=>x.status==="enviado"&&x.respondido_em);
    const tempos=respondidas.map(x=>duracaoMs(x.criado_em,x.respondido_em)).filter(x=>x!=null);
    document.getElementById("kpiAcessosPortal").textContent=acessos.length.toLocaleString("pt-BR");
    document.getElementById("kpiUsuariosUnicos").textContent=usuarios.size.toLocaleString("pt-BR");
    document.getElementById("kpiSolicitacoesAnalitico").textContent=solicitacoes.length.toLocaleString("pt-BR");
    document.getElementById("kpiPendentesAnalitico").textContent=`${solicitacoes.filter(x=>["pendente","em_atendimento"].includes(x.status)).length} pendentes/em atendimento`;
    document.getElementById("kpiTempoMedio").textContent=tempos.length?tempoHumano(tempos.reduce((a,b)=>a+b,0)/tempos.length):"-";
    renderAcessosDia(acessos,inicio);renderStatus(solicitacoes);renderTopUsuarios(acessos);renderTopPaginas(acessos);renderAtendimentos(solicitacoes,perfis);renderSolicitantes(solicitacoes);
  }

  function renderAcessosDia(acessos,inicio){
    const mapa=mapaContagem(acessos,x=>chaveDia(x.acessado_em));
    const itens=[...mapa].map(([dia,v])=>({dia,total:v.length,data:new Date(v[0].acessado_em)})).sort((a,b)=>a.data-b.data);
    graficoAcessos?.destroy();graficoAcessos=new Chart(document.getElementById("graficoAcessosDia"),{type:"line",data:{labels:itens.map(x=>x.dia),datasets:[{label:"Acessos",data:itens.map(x=>x.total),borderColor:"#087866",backgroundColor:"rgba(8,120,102,.16)",fill:true,tension:.3,pointBackgroundColor:"#f2c700",pointBorderColor:"#003f35"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
  }
  function renderStatus(s){const ordem=["pendente","em_atendimento","enviado","cancelado"],rot={pendente:"Pendente",em_atendimento:"Em atendimento",enviado:"Enviado",cancelado:"Cancelado"};const c=ordem.map(k=>s.filter(x=>x.status===k).length);graficoStatus?.destroy();graficoStatus=new Chart(document.getElementById("graficoStatusSolicitacoes"),{type:"doughnut",data:{labels:ordem.map(k=>rot[k]),datasets:[{data:c,backgroundColor:["#f2c700","#2997d6","#087866","#8a9995"],borderWidth:2,borderColor:"#fff"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}}}})}
  function renderTopUsuarios(a){const m=mapaContagem(a,x=>x.usuario_id);const itens=[...m.values()].map(v=>({u:v[0],total:v.length,ultimo:v[0].acessado_em})).sort((x,y)=>y.total-x.total).slice(0,10);document.getElementById("tbodyTopUsuarios").innerHTML=itens.length?itens.map(x=>`<tr><td><strong>${escapar(x.u.usuario_nome||x.u.usuario_email)}</strong><div class="small text-muted">${escapar(x.u.usuario_email)}</div></td><td>${escapar(x.u.perfil)}</td><td class="text-end fw-bold">${x.total}</td><td>${dataLocal(x.ultimo)}</td></tr>`).join(""):'<tr><td colspan="4" class="text-center text-muted py-3">Sem acessos no período.</td></tr>'}
  function renderTopPaginas(a){const m=mapaContagem(a,x=>x.pagina);const itens=[...m.entries()].map(([p,v])=>({p,t:v[0].titulo_pagina||p,total:v.length})).sort((x,y)=>y.total-x.total).slice(0,10);document.getElementById("tbodyTopPaginas").innerHTML=itens.length?itens.map(x=>`<tr><td><strong>${escapar(x.t)}</strong><div class="small text-muted">${escapar(x.p)}</div></td><td class="text-end fw-bold">${x.total}</td><td class="text-end">${a.length?Math.round(x.total/a.length*100):0}%</td></tr>`).join(""):'<tr><td colspan="3" class="text-center text-muted py-3">Sem páginas registradas.</td></tr>'}
  function renderAtendimentos(s,p){const mp=new Map(p.map(x=>[x.id,x]));document.getElementById("tbodyAtendimentos").innerHTML=s.length?s.map(x=>{const r=mp.get(x.atendido_por||x.respondido_por),ms=duracaoMs(x.criado_em,x.respondido_em);return`<tr><td><strong>${escapar(x.solicitante_nome||x.solicitante_email)}</strong><div class="small text-muted">${escapar(x.solicitante_email)}</div></td><td><strong>${escapar(x.numero_sr)}</strong><div class="small text-muted">${x.ano}</div></td><td>${escapar(x.status)}</td><td>${dataLocal(x.criado_em)}</td><td>${escapar(r?.nome||r?.email||"-")}</td><td>${dataLocal(x.respondido_em)}</td><td class="${ms==null?"tempo-pendente":"tempo-ok"}">${tempoHumano(ms)}</td></tr>`}).join(""):'<tr><td colspan="7" class="text-center text-muted py-3">Nenhuma solicitação no período.</td></tr>'}
  function renderSolicitantes(s){const m=mapaContagem(s,x=>x.solicitante_id);const itens=[...m.values()].map(v=>({u:v[0],total:v.length,resp:v.filter(x=>x.status==="enviado").length})).sort((a,b)=>b.total-a.total);document.getElementById("tbodyTopSolicitantes").innerHTML=itens.length?itens.map(x=>`<tr><td><strong>${escapar(x.u.solicitante_nome||x.u.solicitante_email)}</strong><div class="small text-muted">${escapar(x.u.solicitante_email)}</div></td><td class="text-end fw-bold">${x.total}</td><td class="text-end text-success fw-bold">${x.resp}</td><td class="text-end text-warning-emphasis fw-bold">${x.total-x.resp}</td></tr>`).join(""):'<tr><td colspan="4" class="text-center text-muted py-3">Nenhuma solicitação no período.</td></tr>'}

  window.carregarAnaliticoPortal=carregarAnaliticoPortal;
  carregarAnaliticoPortal();
})();
