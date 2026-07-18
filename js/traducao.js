(function () {
  "use strict";

  if (window.PLUMA_TRADUCAO) return;

  const traducoes = {
    "Issue Type": "Tipo de ocorrência",
    "Service": "Serviço",
    "Severity": "Severidade",
    "Summary": "Resumo",
    "Milestone Date": "Data limite",
    "Escalation Status": "Status da escalação",

    "Critical Outage": "Indisponibilidade crítica",
    "General Guidance": "Orientação geral",
    "Significant Impairment": "Impacto significativo",
    "Technical Issue": "Problema técnico",

    "Awaiting Internal Response": "Aguardando resposta interna",
    "Close Requested": "Fechamento solicitado",
    "Closed": "Fechado",
    "Customer Working": "Ação com o cliente",
    "Development Working": "Em análise pelo desenvolvimento",
    "Pending Final Closure": "Aguardando fechamento definitivo",
    "Review Defect": "Revisão de defeito",
    "Review Update": "Revisão de atualização",
    "Solution Offered": "Solução apresentada",
    "Work in Progress": "Em andamento",
    "Open": "Aberto",
    "Resolved": "Resolvido",
    "Waiting": "Aguardando",
    "In Progress": "Em andamento",

    "1-Critical": "1-Crítica",
    "2-Significant": "2-Significativa",
    "3-Standard": "3-Padrão",
    "4-Minimal": "4-Mínima",

    "Autonomous Database Serverless": "Banco de Dados Autônomo sem Servidor",
    "Fusion Data Intelligence": "Inteligência de Dados Fusion",
    "Identity Cloud Service (IDCS)": "Serviço de Identidade na Nuvem (IDCS)",
    "Latin America Cloud Local Solution (LACLS)": "Solução Local Oracle Cloud para América Latina (LACLS)",
    "OCI Application Performance Monitoring Service": "Monitoramento de Desempenho de Aplicações OCI",
    "OCI Compute": "Computação OCI",
    "Oracle APEX in Cloud": "Oracle APEX na Nuvem",
    "Oracle Cloud Infrastructure": "Infraestrutura Oracle Cloud",
    "Oracle Cloud Infrastructure - API Gateway": "Gateway de APIs da Infraestrutura Oracle Cloud",
    "Oracle Cloud Infrastructure Resource Manager": "Gerenciador de Recursos da Infraestrutura Oracle Cloud",
    "Oracle Data Transforms": "Transformação de Dados Oracle",
    "Oracle Enterprise Data Management Cloud Service": "Gestão Corporativa de Dados",
    "Oracle Enterprise Planning and Budgeting Cloud Service": "Planejamento e Orçamento Empresarial",
    "Oracle Financial Consolidation and Close Cloud Service": "Consolidação e Fechamento Financeiro",
    "Oracle Financials for the Americas": "Oracle Financeiro para as Américas",
    "Oracle Fusion Assets Cloud Service": "Ativos Fixos",
    "Oracle Fusion Automated Invoice Processing Cloud Service": "Processamento Automatizado de Faturas",
    "Oracle Fusion Cost Management Cloud Service": "Gestão de Custos",
    "Oracle Fusion Expenses Cloud Service": "Despesas",
    "Oracle Fusion Financials Common Module Cloud Service": "Módulo Financeiro Comum",
    "Oracle Fusion Financials for the Americas": "Oracle Fusion Financeiro para as Américas",
    "Oracle Fusion Global Human Resources Cloud Service": "Recursos Humanos Global",
    "Oracle Fusion Human Resources Help Desk Cloud Service": "Central de Atendimento de Recursos Humanos",
    "Oracle Fusion Inventory Management Cloud Service": "Gestão de Inventário",
    "Oracle Fusion Manufacturing Cloud Service": "Manufatura",
    "Oracle Fusion Order Management Cloud Service": "Gestão de Pedidos",
    "Oracle Fusion Payables Cloud Service": "Contas a Pagar",
    "Oracle Fusion Payments Cloud Service": "Pagamentos",
    "Oracle Fusion Performance Management Cloud Service": "Gestão de Desempenho",
    "Oracle Fusion Procurement Contracts Cloud Service": "Contratos de Compras",
    "Oracle Fusion Product Development Cloud Service": "Desenvolvimento de Produtos",
    "Oracle Fusion Product Hub Cloud Service": "Central de Produtos",
    "Oracle Fusion Project Costing Cloud Service": "Custos de Projetos",
    "Oracle Fusion Project Foundation Cloud Service": "Estrutura de Projetos",
    "Oracle Fusion Purchasing Cloud Service": "Compras",
    "Oracle Fusion Receivables Cloud Service": "Contas a Receber",
    "Oracle Fusion Self Service Procurement Cloud Service": "Compras por Autoatendimento",
    "Oracle Fusion Service Cloud Service": "Atendimento Oracle Fusion",
    "Oracle Fusion Sourcing Cloud Service": "Cotações e Negociações",
    "Oracle Fusion Supply Chain Financial Orchestration Foundation": "Orquestração Financeira da Cadeia de Suprimentos",
    "Oracle Fusion Tax Cloud Service": "Tributos",
    "Oracle Integration 3": "Integração Oracle 3",
    "Oracle Logistics Local Solution (LOGLS)": "Solução Local de Logística Oracle (LOGLS)",
    "Oracle Maintenance Cloud Service": "Manutenção",
    "Oracle Supply Planning Cloud Service": "Planejamento de Suprimentos",
    "Oracle Transportation Intelligence Cloud Service": "Inteligência de Transportes",
    "Oracle Transportation Management Cloud Service": "Gestão de Transportes",
    "Oracle Utilities Customer Care and Billing": "Atendimento e Faturamento de Utilities",
    "Oracle WebLogic Server for OCI": "Servidor Oracle WebLogic para OCI"
  };

  function traduzir(valor) {
    const texto = String(valor == null ? "" : valor);
    return traducoes[texto.trim()] || texto;
  }

  function traduzirNo(root) {
    if (!root) return;
    const tratar = node => {
      const original = String(node.nodeValue || "");
      const limpo = original.trim();
      if (!limpo || !traducoes[limpo]) return;
      node.nodeValue = original.replace(limpo, traducoes[limpo]);
    };

    if (root.nodeType === Node.TEXT_NODE) tratar(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) tratar(walker.currentNode);
  }

  let agendado = false;
  function agendar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      traduzirNo(document.body);
    });
  }

  window.PLUMA_TRADUCAO = { traduzir, traduzirLista: lista => (lista || []).map(traduzir) };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", agendar);
  else agendar();

  new MutationObserver(agendar).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
