(() => {
  'use strict';

  const CSV_PADRAO = 'dados/dados_sr_2026.csv';
  const CSV_FALLBACK = 'dados/dados_sr.csv';
  const REFRESH_MS = 5 * 60 * 1000; // mantém a tela viva: tenta reler o CSV a cada 5 min

  function cacheBusterUrl(url) {
    const sep = String(url).includes('?') ? '&' : '?';
    return `${url}${sep}_nocache=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const state = {
    raw: [],
    view: [],
    sourceName: CSV_PADRAO,
    sortKey: 'Serviço',
    sortDir: 'asc',
    initialized: false,
    latestGeneratedDate: null,
    cutDateManual: false,
    startDateManual: false
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    startDate: $('startDate'),
    cutDate: $('cutDate'),
    statusFilter: $('statusFilter'),
    serviceFilter: $('serviceFilter'),
    searchBox: $('searchBox'),
    reloadBtn: $('reloadBtn'),
    fileInput: $('fileInput'),
    exportBtn: $('exportBtn'),
    statusMessage: $('statusMessage'),
    updatedAt: $('updatedAt'),
    csvName: $('csvName'),
    feedbackTable: $('feedbackTable'),
    advancedText: $('advancedText'),
    attentionList: $('attentionList'),
    adjustText: $('adjustText'),
    noGoTable: $('noGoTable'),
    tableSubTitle: $('tableSubTitle'),
    srTableBody: $('srTableBody')
  };

  function setMessage(type, text) {
    els.statusMessage.className = `status-message ${type}`;
    els.statusMessage.innerHTML = text;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function parseCSV(text) {
    const lines = String(text || '').split(/\r?\n/).filter(line => line.trim() !== '');
    if (!lines.length) return [];

    const headerLine = lines[0].replace(/^\uFEFF/, '');
    const delimiters = [',', ';', '\t', '|'];
    let delimiter = ',';
    let maxCols = 0;

    for (const d of delimiters) {
      const count = splitCSVLine(headerLine, d).length;
      if (count > maxCols) {
        maxCols = count;
        delimiter = d;
      }
    }

    const headers = splitCSVLine(headerLine, delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

    return lines.slice(1).map(line => {
      const cols = splitCSVLine(line, delimiter);
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = cleanCell(cols[idx]);
      });
      return obj;
    }).filter(row => Object.values(row).some(v => String(v || '').trim() !== ''));
  }

  function splitCSVLine(line, delimiter) {
    const out = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"' && quoted && next === '"') {
        cell += '"';
        i++;
        continue;
      }

      if (ch === '"') {
        quoted = !quoted;
        continue;
      }

      if (ch === delimiter && !quoted) {
        out.push(cell);
        cell = '';
        continue;
      }

      cell += ch;
    }

    out.push(cell);
    return out;
  }

  function cleanCell(value) {
    return String(value ?? '').trim().replace(/^"|"$/g, '').trim();
  }

  function getField(row, candidates) {
    for (const c of candidates) {
      if (Object.prototype.hasOwnProperty.call(row, c)) return row[c];
    }

    const keys = Object.keys(row || {});
    const normalizedCandidates = candidates.map(normalize);
    const foundKey = keys.find(k => normalizedCandidates.includes(normalize(k).replace(/_/g, ' ')));
    return foundKey ? row[foundKey] : '';
  }

  function getSr(row) { return getField(row, ['Número SR', 'Numero SR', 'SR', 'Service Request']); }
  function getService(row) { return getField(row, ['Serviço', 'Servico', 'Service']); }
  function getIssue(row) { return getField(row, ['Issue Type', 'Tipo', 'Tipo de Ocorrência']); }
  function getStatus(row) { return getField(row, ['Status']); }
  function getSeverity(row) { return getField(row, ['Severidade', 'Severity']); }
  function getCreated(row) { return getField(row, ['Criado_dt', 'Criado', 'Created']); }
  function getUpdated(row) { return getField(row, ['Atualizado_dt', 'Atualizado', 'Updated']); }
  function getContact(row) { return getField(row, ['Contato Primário', 'Contato Primario', 'Primary Contact']); }
  function getGenerated(row) { return getField(row, ['Gerado_em', 'Gerado em', 'Atualizado em', 'Atualizado_em']); }

  function parseDate(value, baseRef) {
    let s = String(value || '').trim().replace(/^"|"$/g, '');
    if (!s) return null;

    const base = baseRef ? parseAbsoluteDate(baseRef) : state.latestGeneratedDate;
    const rel = s.match(/^(Today|Yesterday)\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (rel && base) {
      const d = new Date(base.getTime());
      if (/yesterday/i.test(rel[1])) d.setDate(d.getDate() - 1);
      let hh = Number(rel[2]);
      const mm = Number(rel[3]);
      const ap = rel[4].toUpperCase();
      if (ap === 'PM' && hh < 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;
      d.setHours(hh, mm, 0, 0);
      return isNaN(d) ? null : d;
    }

    return parseAbsoluteDate(s);
  }

  function parseAbsoluteDate(s) {
    s = String(s || '').trim();
    if (!s) return null;

    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)) {
      const d = new Date(s.replace(' ', 'T'));
      if (!isNaN(d)) return d;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
      const d = new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
      return isNaN(d) ? null : d;
    }

    m = s.match(/^([A-Za-z]{3})\s+(\d{1,2})(?:,)?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/);
    if (m) {
      const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
      const mon = months[m[1]];
      if (mon !== undefined) {
        let hh = Number(m[4] || 0);
        const mm = Number(m[5] || 0);
        const ap = String(m[6] || '').toUpperCase();
        if (ap === 'PM' && hh < 12) hh += 12;
        if (ap === 'AM' && hh === 12) hh = 0;
        const d = new Date(Number(m[3]), mon, Number(m[2]), hh, mm, 0);
        return isNaN(d) ? null : d;
      }
    }

    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  function isoDate(d) {
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatDate(d) {
    if (!d) return '-';
    return d.toLocaleDateString('pt-BR');
  }

  function formatDateTime(d) {
    if (!d) return '-';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function isClosedStatus(status) {
    return window.SRMetrics.isFechado(status);
  }

  function classifyImpact(severity, issue) {
    const s = normalize(`${severity} ${issue}`);
    if (s.includes('critical') || s.includes('1-') || s.includes('critica')) return 'Alto';
    if (s.includes('significant') || s.includes('2-') || s.includes('significativa') || s.includes('impairment')) return 'Alto';
    if (s.includes('standard') || s.includes('3-') || s.includes('padrao')) return 'Médio';
    return 'Baixo';
  }

  function shortServiceName(service) {
    const s = normalize(service);
    const rules = [
      ['inventory', 'Inventory'],
      ['tax', 'TAX / LACLS'],
      ['lacls', 'TAX / LACLS'],
      ['logistics', 'LOG-LS'],
      ['log-ls', 'LOG-LS'],
      ['maintenance', 'Maintenance'],
      ['receivables', 'Receivables'],
      ['sourcing', 'Sourcing'],
      ['self service procurement', 'Self Service Procurement'],
      ['procurement', 'Self Service Procurement'],
      ['order management', 'Order Management'],
      ['manufacturing', 'Manufacturing'],
      ['supply planning', 'Supply Planning'],
      ['project costing', 'Project Costing'],
      ['project', 'Project Costing'],
      ['payables', 'Payables'],
      ['cost management', 'Cost Management'],
      ['expenses', 'Expenses'],
      ['integration', 'Oracle Integration'],
      ['redwood', 'Redwood']
    ];

    for (const [key, label] of rules) {
      if (s.includes(key)) return label;
    }

    return service || 'Não informado';
  }

  function enrich(row) {
    const generated = parseAbsoluteDate(getGenerated(row));
    const base = generated || state.latestGeneratedDate;
    const createdDate = parseDate(getCreated(row), base);
    const updatedDate = parseDate(getUpdated(row), base);
    const status = getStatus(row);
    const closed = isClosedStatus(status);
    return {
      ...row,
      __sr: getSr(row),
      __service: getService(row),
      __shortService: shortServiceName(getService(row)),
      __issue: getIssue(row),
      __status: status,
      __severity: getSeverity(row),
      __createdDate: createdDate,
      __updatedDate: updatedDate,
      __contact: getContact(row),
      __generatedDate: generated,
      __closed: closed,
      __impact: classifyImpact(getSeverity(row), getIssue(row))
    };
  }

  function computeLatestGenerated(rawRows) {
    let latest = null;
    for (const row of rawRows) {
      const d = parseAbsoluteDate(getGenerated(row));
      if (d && (!latest || d > latest)) latest = d;
    }
    return latest || new Date();
  }

  function computeEarliestCreated(enrichedRows) {
    let earliest = null;
    for (const row of enrichedRows || []) {
      const d = row.__createdDate;
      if (d && (!earliest || d < earliest)) earliest = d;
    }
    return earliest;
  }

  async function fetchCsvArquivo(nomeArquivo) {
    const response = await fetch(cacheBusterUrl(nomeArquivo), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  async function loadFromFetch() {
    const agora = new Date();
    setMessage('info', `Buscando atualização online de <strong>${CSV_PADRAO}</strong> às <strong>${formatDateTime(agora)}</strong>...`);

    try {
      const text = await fetchCsvArquivo(CSV_PADRAO);
      loadRows(parseCSV(text), CSV_PADRAO, true);
    } catch (erroPrincipal) {
      console.warn(`Falha ao carregar ${CSV_PADRAO}. Tentando fallback ${CSV_FALLBACK}.`, erroPrincipal);
      const text = await fetchCsvArquivo(CSV_FALLBACK);
      loadRows(parseCSV(text), CSV_FALLBACK, true);
    }
  }

  function loadRows(rows, sourceName, veioDoOnline = false) {
    const linhasUnicas = window.SRMetrics.normalizarDados(rows);
    state.sourceName = sourceName;
    state.latestGeneratedDate = computeLatestGenerated(linhasUnicas);
    state.raw = linhasUnicas.map(enrich);

    els.csvName.textContent = sourceName;
    els.updatedAt.textContent = formatDateTime(state.latestGeneratedDate);

    // Atualiza o período automaticamente quando o CSV online muda,
    // mas preserva as datas quando o usuário escolheu manualmente.
    const primeiraDataCriacao = computeEarliestCreated(state.raw) || state.latestGeneratedDate;

    if (els.startDate && (!els.startDate.value || !state.startDateManual)) {
      els.startDate.value = isoDate(primeiraDataCriacao);
    }

    if (els.cutDate && (!els.cutDate.value || !state.cutDateManual)) {
      els.cutDate.value = isoDate(state.latestGeneratedDate);
    }

    if (els.startDate && getStartDate() > getCutDate()) {
      els.startDate.value = isoDate(getCutDate());
    }

    fillFilters();
    applyAndRender();
    const origem = veioDoOnline ? 'online' : 'arquivo local';
    setMessage('success', `Dados atualizados via ${origem}: <strong>${state.raw.length}</strong> SRs. Período atual: <strong>${formatDate(getStartDate())}</strong> até <strong>${formatDate(getCutDate())}</strong>. Última checagem: <strong>${formatDateTime(new Date())}</strong>.`);
    state.initialized = true;
  }

  function fillFilters() {
    fillSelect(els.statusFilter, [...new Set(state.raw.map(r => r.__status).filter(Boolean))].sort());
    fillSelect(els.serviceFilter, [...new Set(state.raw.map(r => r.__shortService).filter(Boolean))].sort());
  }

  function fillSelect(select, values) {
    const current = select.value;
    select.innerHTML = '<option value="">Todos</option>';
    for (const v of values) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function getStartDate() {
    const fallback = computeEarliestCreated(state.raw) || state.latestGeneratedDate || new Date();
    if (!els.startDate?.value) return fallback;
    return parseAbsoluteDate(els.startDate.value) || fallback;
  }

  function getCutDate() {
    if (!els.cutDate?.value) return state.latestGeneratedDate || new Date();
    return parseAbsoluteDate(els.cutDate.value) || state.latestGeneratedDate || new Date();
  }

  function isRelevantAtCut(row, cutEnd) {
    if (!row.__createdDate) return false;
    return row.__createdDate <= cutEnd;
  }

  function isInSelectedPeriod(row, startStart, finalEnd) {
    const createdInPeriod = row.__createdDate && row.__createdDate >= startStart && row.__createdDate <= finalEnd;
    const updatedInPeriod = row.__updatedDate && row.__updatedDate >= startStart && row.__updatedDate <= finalEnd;

    // Regra do filtro: entrou no período se foi criado OU atualizado entre as datas selecionadas.
    return Boolean(createdInPeriod || updatedInPeriod);
  }

  function isOpenStatus(row) {
    return !row.__closed;
  }

  function isClosedInPeriod(row, startStart, finalEnd) {
    if (!row.__closed) return false;

    if (row.__updatedDate) {
      return row.__updatedDate >= startStart && row.__updatedDate <= finalEnd;
    }

    return Boolean(row.__createdDate && row.__createdDate >= startStart && row.__createdDate <= finalEnd);
  }

  function applyAndRender() {
    const start = getStartDate();
    const finalDate = getCutDate();
    const startStart = startOfDay(start);
    const finalEnd = endOfDay(finalDate);
    const status = els.statusFilter.value;
    const service = els.serviceFilter.value;
    const search = normalize(els.searchBox.value);

    if (startStart > finalEnd) {
      setMessage('error', 'A <strong>data inicial</strong> não pode ser maior que a <strong>data final</strong>. Ajuste o período para continuar.');
      state.view = [];
      renderFeedback([]);
      renderAdvanced([], [], start, finalDate);
      renderAttention([], [], []);
      renderAdjust([]);
      renderNoGo([], []);
      renderServiceCard([]);
      renderTable([], [], [], start, finalDate);
      return;
    }

    // Regra solicitada: a Data Final é apenas o final do filtro.
    // O painel deve trazer SRs com Criado_dt ou Atualizado_dt dentro do intervalo selecionado.
    let rows = state.raw.filter(row => isInSelectedPeriod(row, startStart, finalEnd));

    if (status) rows = rows.filter(row => row.__status === status);
    if (service) rows = rows.filter(row => row.__shortService === service);
    if (search) {
      rows = rows.filter(row => normalize([
        row.__sr, row.__service, row.__shortService, row.__issue, row.__status, row.__severity, row.__contact
      ].join(' ')).includes(search));
    }

    rows.sort(sorter(state.sortKey, state.sortDir));
    state.view = rows;

    const openRows = rows.filter(isOpenStatus);
    const closedInPeriod = rows.filter(row => isClosedInPeriod(row, startStart, finalEnd));
    const newInPeriod = rows.filter(row => row.__createdDate && row.__createdDate >= startStart && row.__createdDate <= finalEnd);

    renderFeedback(rows);
    renderAdvanced(closedInPeriod, newInPeriod, start, finalDate);
    renderAttention(rows, openRows, newInPeriod);
    renderAdjust(rows);
    renderNoGo(rows, closedInPeriod);
    renderServiceCard(openRows);
    renderTable(rows, openRows, closedInPeriod, start, finalDate);

    if (state.initialized) {
      const origem = [CSV_PADRAO, CSV_FALLBACK].includes(state.sourceName) ? 'online' : 'arquivo local';
      setMessage('success', `Dados atualizados via ${origem}: <strong>${state.raw.length}</strong> SRs. Período selecionado: <strong>${formatDate(start)}</strong> até <strong>${formatDate(finalDate)}</strong>. Última checagem: <strong>${formatDateTime(new Date())}</strong>.`);
    }
  }

  function sorter(key, dir) {
    const factor = dir === 'asc' ? 1 : -1;
    return (a, b) => {
      let av = valueForSort(a, key);
      let bv = valueForSort(b, key);
      if (av instanceof Date) av = av.getTime();
      if (bv instanceof Date) bv = bv.getTime();
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' }) * factor;
    };
  }

  function valueForSort(row, key) {
    const map = {
      'Número SR': row.__sr,
      'Serviço': row.__shortService,
      'Issue Type': row.__issue,
      'Status': row.__status,
      'Severidade': row.__severity,
      'Criado_dt': row.__createdDate || 0,
      'Atualizado_dt': row.__updatedDate || 0,
      'Contato Primário': row.__contact
    };
    return map[key] ?? '';
  }

  function groupCount(rows, keyFn) {
    const map = new Map();
    for (const row of rows) {
      const key = keyFn(row) || 'Não informado';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  }

  function renderFeedback(rowsInPeriod) {
    const grouped = groupCount(rowsInPeriod, row => row.__shortService).slice(0, 14);
    if (!grouped.length) {
      els.feedbackTable.innerHTML = '<tr><td colspan="3">Nenhuma SR encontrada no período.</td></tr>';
      return;
    }

    els.feedbackTable.innerHTML = grouped.map(([service, qtd]) => {
      const rows = rowsInPeriod.filter(r => r.__shortService === service);
      const impact = rows.some(r => r.__impact === 'Alto') ? 'Alto' : rows.some(r => r.__impact === 'Médio') ? 'Médio' : 'Baixo';
      return `<tr><td>${escapeHtml(service)}</td><td>${qtd}</td><td>${impactBadge(impact)}</td></tr>`;
    }).join('');
  }

  function renderAdvanced(closedRows, newInPeriod, start, cut) {
    const count = closedRows.length;
    const verb = count === 1 ? 'SR fechada' : 'SRs fechadas';
    els.advancedText.innerHTML = `<strong>${count}</strong> ${verb} no período de ${formatDate(start)} até ${formatDate(cut)}.<br><span class="muted"><strong>${newInPeriod.length}</strong> nova(s) criada(s) no período.</span>`;
  }

  function renderAttention(allRows, openRows, newInPeriod) {
    const escalated = allRows.filter(row => normalize(`${row.__status} ${row.__issue}`).includes('escalat'));
    const redwood = allRows.filter(row => normalize(`${row.__service} ${row.__issue}`).includes('redwood'));
    const highImpact = allRows.filter(row => row.__impact === 'Alto');

    els.attentionList.innerHTML = [
      `<li><strong>${newInPeriod.length}</strong> SRs novas no período.</li>`,
      `<li><strong>${escalated.length}</strong> SRs escaladas no período.</li>`,
      `<li><strong>${redwood.length}</strong> SRs de telas Redwood no período.</li>`,
      `<li><strong>${highImpact.length}</strong> SRs com impacto alto no período.</li>`
    ].join('');
  }

  function renderAdjust(rowsInPeriod) {
    const critical = rowsInPeriod.filter(row => row.__impact === 'Alto');
    if (!critical.length) {
      els.adjustText.textContent = 'Nada no momento.';
      return;
    }

    const top = groupCount(critical, row => row.__shortService).slice(0, 3);
    els.adjustText.innerHTML = top.map(([service, qtd]) => `<strong>${escapeHtml(service)}</strong>: ${qtd} SR(s) no período com impacto alto`).join('<br>');
  }

  function renderNoGo(rowsInPeriod, closedRows) {
    const noGoRows = rowsInPeriod.filter(row => row.__impact === 'Alto');
    const grouped = groupCount(noGoRows, row => row.__shortService).slice(0, 8);

    if (!grouped.length) {
      els.noGoTable.innerHTML = '<tr><td colspan="3">Sem No Go no período.</td></tr>';
      return;
    }

    els.noGoTable.innerHTML = grouped.map(([service, qtd]) => {
      const resolved = closedRows.filter(row => row.__shortService === service).length;
      return `<tr><td>${escapeHtml(service)}</td><td>${qtd}</td><td>${resolved}</td></tr>`;
    }).join('');
  }

  function renderServiceCard(openRows) {
    $('kpiOpen').textContent = openRows.length;
    $('kpiCustomer').textContent = openRows.filter(row => normalize(row.__status).includes('customer working')).length;
    $('kpiDev').textContent = openRows.filter(row => normalize(row.__status).includes('dev')).length;
    $('kpiOracle').textContent = openRows.filter(row => normalize(row.__status).includes('oracle')).length;

    $('sevCritical').textContent = openRows.filter(row => normalize(row.__severity).includes('critical') || normalize(row.__severity).startsWith('1-')).length;
    $('sevSignificant').textContent = openRows.filter(row => normalize(row.__severity).includes('significant') || normalize(row.__severity).startsWith('2-')).length;
    $('sevStandard').textContent = openRows.filter(row => normalize(row.__severity).includes('standard') || normalize(row.__severity).startsWith('3-')).length;
    $('sevLow').textContent = openRows.filter(row => normalize(row.__severity).includes('low') || normalize(row.__severity).includes('minor') || normalize(row.__severity).startsWith('4-')).length;

    $('impactHigh').textContent = openRows.filter(row => row.__impact === 'Alto').length;
    $('impactMedium').textContent = openRows.filter(row => row.__impact === 'Médio').length;
    $('impactLow').textContent = openRows.filter(row => row.__impact === 'Baixo').length;
  }

  function renderTable(rows, openRows, closedRows, start, finalDate) {
    els.tableSubTitle.innerHTML = `<strong>${rows.length}</strong> chamado(s) dentro do período de ${formatDate(start)} até ${formatDate(finalDate)} • <strong>${openRows.length}</strong> aberto(s) no período • <strong>${closedRows.length}</strong> fechado(s) no período`;

    if (!rows.length) {
      els.srTableBody.innerHTML = '<tr><td colspan="8">Nenhum chamado encontrado para o período e filtros atuais.</td></tr>';
      return;
    }

    els.srTableBody.innerHTML = rows.map(row => {
      const open = isOpenStatus(row);
      return `<tr>
        <td title="${escapeHtml(row.__sr)}">${escapeHtml(row.__sr)}</td>
        <td title="${escapeHtml(row.__service)}">${escapeHtml(row.__shortService)}</td>
        <td title="${escapeHtml(row.__issue)}">${escapeHtml(row.__issue)}</td>
        <td>${statusBadge(row.__status, open)}</td>
        <td>${severityBadge(row.__severity, row.__impact)}</td>
        <td>${escapeHtml(formatDate(row.__createdDate))}</td>
        <td>${escapeHtml(formatDate(row.__updatedDate))}</td>
        <td title="${escapeHtml(row.__contact)}">${escapeHtml(row.__contact)}</td>
      </tr>`;
    }).join('');
  }

  function statusBadge(status, open) {
    const cls = open ? 'open' : 'closed';
    return `<span class="badge ${cls}" title="${escapeHtml(status)}">${escapeHtml(status || '-')}</span>`;
  }

  function severityBadge(severity, impact) {
    const cls = impact === 'Alto' ? 'high' : impact === 'Médio' ? 'medium' : 'low';
    return `<span class="badge ${cls}" title="${escapeHtml(severity)}">${escapeHtml(severity || '-')}</span>`;
  }

  function impactBadge(impact) {
    const cls = impact === 'Alto' ? 'high' : impact === 'Médio' ? 'medium' : 'low';
    return `<span class="badge ${cls}">${impact}</span>`;
  }

  function exportCurrentView() {
    const headers = ['Número SR', 'Serviço', 'Issue Type', 'Status', 'Severidade', 'Criado_dt', 'Atualizado_dt', 'Contato Primário'];
    const lines = [headers.join(';')];

    for (const row of state.view) {
      const values = [
        row.__sr,
        row.__shortService,
        row.__issue,
        row.__status,
        row.__severity,
        formatDate(row.__createdDate),
        formatDate(row.__updatedDate),
        row.__contact
      ].map(v => `"${String(v ?? '').replaceAll('"', '""')}"`);
      lines.push(values.join(';'));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sr_periodo_${els.startDate?.value || 'inicio'}_${els.cutDate?.value || 'fim'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    els.startDate?.addEventListener('change', () => {
      state.startDateManual = true;
      applyAndRender();
    });

    els.cutDate?.addEventListener('change', () => {
      state.cutDateManual = true;
      applyAndRender();
    });
    [els.statusFilter, els.serviceFilter].forEach(el => el.addEventListener('change', applyAndRender));
    els.searchBox.addEventListener('input', applyAndRender);
    els.reloadBtn?.addEventListener('click', () => loadFromFetch().catch(handleFetchError));
    els.exportBtn?.addEventListener('click', exportCurrentView);

    els.fileInput?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      state.startDateManual = true;
      state.cutDateManual = true;
      loadRows(parseCSV(text), file.name, false);
    });

    document.querySelectorAll('.sr-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          state.sortKey = key;
          state.sortDir = 'asc';
        }
        applyAndRender();
      });
    });
  }

  function handleFetchError(error) {
    console.error(error);
    setMessage('error', `Não consegui carregar <strong>${CSV_PADRAO}</strong> automaticamente. Motivo: <strong>${escapeHtml(error.message)}</strong>. Verifique se o arquivo <strong>dados_sr_2026.csv</strong> está publicado na mesma pasta da página. Se ele não existir, o painel tenta usar <strong>dados_sr.csv</strong> como fallback.`);
  }

  bindEvents();
  loadFromFetch().catch(handleFetchError);

  setInterval(() => {
    if (!state.initialized) return;
    loadFromFetch().catch(() => {
      // silencioso para não incomodar em modo TV
    });
  }, REFRESH_MS);
})();
