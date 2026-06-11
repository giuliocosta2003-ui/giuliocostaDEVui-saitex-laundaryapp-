/*************************************************************************
 *  SAITEX LAUNDRY — Backend Google Apps Script (JSONP)  [v2]
 *  Collega l'app "index.html" al Google Sheet del tracker.
 *
 *  Novità v2:
 *   • Confronto del codice tessuto ROBUSTO: ignora spazi, caratteri
 *     invisibili (zero-width, non-breaking space) e maiuscole/minuscole.
 *   • Risposta diagnostica: distingue "codice non trovato" da "errore
 *     di scrittura" e mostra i codici realmente letti dal foglio.
 *
 *  AZIONI:
 *   • action=getData  -> elenco dei campioni
 *   • action=update   -> aggiorna STATUS + data/ora di un codice
 *
 *  REGOLA SPECIALE "Sent to Amata":
 *   • Se lo stato contiene "Amata":
 *       STATUS      -> "🔄 IN PROGRESS"
 *       LAST UPDATE -> "Sent to Amata · gg/mm/aaaa hh:mm"
 *************************************************************************/

var SHEET_NAME      = '';   // '' = rileva automaticamente (cerca "TRACKER")
var HEADER_ROW      = 3;    // riga con i titoli delle colonne
var DATA_START_ROW  = 4;    // prima riga di dati

// ─────────────────────────────────────────────────────────────────────
function doGet(e) {
  var params   = (e && e.parameter) ? e.parameter : {};
  var callback = params.callback || '';
  var out;
  try {
    var action = params.action || 'getData';
    if (action === 'update') {
      out = doUpdate(params.req, params.stato, params.codice);
    } else if (action === 'add') {
      out = doAdd(params);
    } else if (action === 'getPlan') {
      out = getPlan();
    } else if (action === 'setPlan') {
      out = setPlan(params.mode, params.pinned, params.groups);
    } else if (action === 'getNotes') {
      out = getNotes();
    } else if (action === 'setNotes') {
      out = setNotes(params.notes);
    } else if (action === 'getMessages') {
      out = getMessages();
    } else if (action === 'setMessages') {
      out = setMessages(params.messages);
    } else {
      out = getData();
    }
  } catch (err) {
    out = { success: false, reason: 'exception', error: String(err) };
  }
  return reply(out, callback);
}

// ── Add a new sample (manager-side fast entry) ─────────────────────────
function generateNewReq(sheet, cols) {
  if (cols.req < 1) return 'REQ-' + new Date().getTime();
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return '1';
  var values = sheet.getRange(DATA_START_ROW, cols.req, lastRow - DATA_START_ROW + 1, 1).getValues();
  var maxNum = 0;
  for (var i = 0; i < values.length; i++) {
    var v = String(values[i][0] || '');
    var m = v.match(/(\d+)\s*$/);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return String(maxNum + 1);
}
function fmtIsoToSheetDate(s) {
  if (!s) return '';
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return m[3] + '/' + m[2] + '/' + m[1];
}
function normalizePriority(p) {
  var pu = String(p || '').toUpperCase();
  if (pu.indexOf('URG') !== -1) return '🔴 URGENT';
  if (pu.indexOf('LOW') !== -1 || pu.indexOf('BAS') !== -1) return '🟢 LOW';
  return '🟡 NORMAL';
}
function doAdd(params) {
  if (!params || !params.codice) return { success: false, reason: 'no_code' };

  var sheet = getSheet();
  var cols  = getCols(sheet);
  if (cols.codice < 1) return { success: false, reason: 'no_code_column' };

  var newRow = sheet.getLastRow() + 1;
  if (newRow < DATA_START_ROW) newRow = DATA_START_ROW;

  var req = generateNewReq(sheet, cols);
  var tz = getTZ();
  var now = new Date();
  var today = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  var nowStamp = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm');

  function setCell(col, val) {
    if (col > 0 && val !== undefined && val !== null && val !== '') {
      sheet.getRange(newRow, col).setValue(val);
    }
  }
  try {
    setCell(cols.req, req);
    setCell(cols.codice, params.codice);
    setCell(cols.desc, params.desc || '');
    setCell(cols.tipo, params.tipo || '');
    setCell(cols.cliente, params.cliente || '');
    setCell(cols.ricetta, params.ricetta || '');
    setCell(cols.qta, params.qta || '');
    setCell(cols.priorita, normalizePriority(params.priorita));
    setCell(cols.stato, '⏳ PENDING');
    setCell(cols.richiestoDa, params.richiestoDa || '');
    setCell(cols.dataRicevuto, params.dataRicevuto ? fmtIsoToSheetDate(params.dataRicevuto) : today);
    setCell(cols.dataRichiesta, params.dataRichiesta ? fmtIsoToSheetDate(params.dataRichiesta) : '');
    setCell(cols.lastUpdate, nowStamp);
    return { success: true, req: req, row: newRow };
  } catch (werr) {
    return { success: false, reason: 'write_error', error: String(werr), row: newRow };
  }
}

// ── Shift plan (stored in Script Properties, no sheet column needed) ──
function getPlan() {
  var p = PropertiesService.getScriptProperties();
  var mode = p.getProperty('PLAN_MODE') || 'auto';
  var pinnedRaw = p.getProperty('PLAN_PINNED') || '';
  var groupsRaw = p.getProperty('PLAN_GROUPS') || '';
  return {
    success: true,
    mode: mode,
    pinnedReqs: pinnedRaw ? pinnedRaw.split('||') : [],
    groupOrder: groupsRaw ? groupsRaw.split('||') : []
  };
}
function setPlan(mode, pinned, groups) {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('PLAN_MODE', (mode === 'manual') ? 'manual' : 'auto');
  p.setProperty('PLAN_PINNED', pinned || '');
  p.setProperty('PLAN_GROUPS', groups || '');
  return getPlan();
}

// ── Manager notes (bulletin board for the operator) ──
function getNotes() {
  var raw = PropertiesService.getScriptProperties().getProperty('MANAGER_NOTES') || '[]';
  try { return { success: true, notes: JSON.parse(raw) }; }
  catch(e) { return { success: true, notes: [] }; }
}
function setNotes(notesJson) {
  try {
    var arr = JSON.parse(notesJson || '[]');
    if (!Array.isArray(arr)) arr = [];
    PropertiesService.getScriptProperties().setProperty('MANAGER_NOTES', JSON.stringify(arr));
    return { success: true, notes: arr };
  } catch (e) {
    return { success: false, reason: 'bad_json', error: String(e) };
  }
}

// ── Manager messages bulletin board ──
function getMessages() {
  var p = PropertiesService.getScriptProperties();
  var raw = p.getProperty('MSG_LIST') || '[]';
  try {
    var arr = JSON.parse(raw);
    return { success: true, messages: Array.isArray(arr) ? arr : [] };
  } catch (e) {
    return { success: true, messages: [] };
  }
}
function setMessages(jsonStr) {
  var p = PropertiesService.getScriptProperties();
  try {
    var arr = JSON.parse(jsonStr || '[]');
    if (!Array.isArray(arr)) arr = [];
    arr = arr.filter(function (m) { return m && m.id && typeof m.text === 'string'; });
    p.setProperty('MSG_LIST', JSON.stringify(arr));
    return { success: true, messages: arr };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function reply(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (SHEET_NAME) {
    var s = ss.getSheetByName(SHEET_NAME);
    if (s) return s;
  }
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toUpperCase().indexOf('TRACKER') !== -1) return sheets[i];
  }
  return sheets[0];
}

function getCols(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  var norm = headers.map(function (h) {
    return String(h).toUpperCase().replace(/[\s\n\r]+/g, '');
  });
  function find(kw) {
    for (var i = 0; i < norm.length; i++) {
      if (norm[i].indexOf(kw) !== -1) return i + 1;
    }
    return -1;
  }
  return {
    req:        find('REQ'),
    codice:     find('FABRICCODE'),
    desc:       find('FABRICDESC'),
    tipo:       find('SAMPLETYPE'),
    cliente:    find('CLIENT'),
    ricetta:    find('WASHRECIPE'),
    qta:        find('QTY'),
    priorita:   find('PRIORITY'),
    stato:      find('STATUS'),
    dataUscita: find('EXIT'),
    richiestoDa: find('REQUESTEDBY'),
    lastUpdate: find('LASTUPDATE'),
    dataRicevuto:  find('DATERECEIVED'),
    dataRichiesta: find('DATEREQUESTED')
  };
}

// Pulisce un valore per la visualizzazione (toglie spazi e caratteri invisibili ai bordi)
function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
}

// Chiave normalizzata per il CONFRONTO dei codici: solo lettere e numeri, maiuscolo.
// Così "S45739", " s45739 ", "S45739<zero-width>" diventano tutti "S45739".
function normKey(v) {
  return String(v === null || v === undefined ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cellStr(row, idx) {
  if (idx < 1) return '';
  return clean(row[idx - 1]);
}

// Restituisce una data come 'yyyy-MM-dd' (leggibile da JavaScript). Se la cella
// non è una data vera, restituisce comunque il testo ripulito.
function cellDate(row, idx, tz) {
  if (idx < 1) return '';
  var v = row[idx - 1];
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return clean(v);
}

// Fuso orario sempre valido (String). Se il foglio non lo espone,
// usa quello dello script, altrimenti il Vietnam (UTC+7).
function getTZ() {
  var tz;
  try { tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); } catch (e) {}
  if (!tz || typeof tz !== 'string') {
    try { tz = Session.getScriptTimeZone(); } catch (e) {}
  }
  if (!tz || typeof tz !== 'string') tz = 'Asia/Ho_Chi_Minh';
  return tz;
}

// ─────────────────────────────────────────────────────────────────────
function getData() {
  var sheet = getSheet();
  var cols  = getCols(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW || cols.codice < 1) return [];

  var lastCol = sheet.getLastColumn();
  var values  = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, lastCol).getValues();
  var tz = getTZ();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row  = values[r];
    var code = cellStr(row, cols.codice);
    if (!code) continue;
    out.push({
      req:        cellStr(row, cols.req),
      codice:     code,
      desc:       cellStr(row, cols.desc),
      tipo:       cellStr(row, cols.tipo),
      cliente:    cellStr(row, cols.cliente),
      ricetta:    cellStr(row, cols.ricetta),
      qta:        cellStr(row, cols.qta),
      priorita:   cellStr(row, cols.priorita),
      statoRaw:   cellStr(row, cols.stato),
      dataUscita: cellStr(row, cols.dataUscita),
      lastUpdate: cellStr(row, cols.lastUpdate),
      richiestoDa: cellStr(row, cols.richiestoDa),
      dataRicevuto:  cellDate(row, cols.dataRicevuto, tz),
      dataRichiesta: cellDate(row, cols.dataRichiesta, tz)
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
function doUpdate(req, stato, codice) {
  if (!req && !codice) return { success: false, reason: 'no_id' };

  var sheet = getSheet();
  var cols  = getCols(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return { success: false, reason: 'empty_sheet' };

  var n = lastRow - DATA_START_ROW + 1;
  var rowIndex = -1, seen = [];

  // Preferred: unique row match by REQ#
  if (req && cols.req > 0) {
    var reqVals = sheet.getRange(DATA_START_ROW, cols.req, n, 1).getValues();
    var targetReq = normKey(req);
    for (var i = 0; i < reqVals.length; i++) {
      var r = reqVals[i][0];
      if (r === '' || r === null || r === undefined) continue;
      if (normKey(r) === targetReq) { rowIndex = DATA_START_ROW + i; break; }
    }
  }

  // Legacy fallback: match by code (first hit). Used only when no REQ# was sent.
  if (rowIndex === -1 && codice && cols.codice > 0) {
    var codeVals = sheet.getRange(DATA_START_ROW, cols.codice, n, 1).getValues();
    var target = normKey(codice);
    for (var i = 0; i < codeVals.length; i++) {
      var raw = codeVals[i][0];
      if (raw === '' || raw === null || raw === undefined) continue;
      if (seen.length < 40) seen.push(clean(raw));
      if (normKey(raw) === target) { rowIndex = DATA_START_ROW + i; break; }
    }
  }

  if (rowIndex === -1) {
    return { success: false, reason: 'not_found', lookedFor: clean(req || codice), codesSeen: seen };
  }

  // Data e ora correnti nel fuso del foglio (con fallback robusto)
  var stamp = Utilities.formatDate(new Date(), getTZ(), 'dd/MM/yyyy HH:mm');

  var isAmata = String(stato).toUpperCase().indexOf('AMATA') !== -1;
  var statusToWrite, lastUpdateToWrite;
  if (isAmata) {
    statusToWrite     = '🔄 IN PROGRESS';
    lastUpdateToWrite = 'Sent to Amata · ' + stamp;
  } else {
    statusToWrite     = stato;
    lastUpdateToWrite = stamp;
  }
  var isCompleted = String(statusToWrite).toUpperCase().indexOf('COMPLETED') !== -1;

  // Scrittura protetta: se fallisce qui è un problema di PERMESSI/deployment
  try {
    if (cols.stato > 0)      sheet.getRange(rowIndex, cols.stato).setValue(statusToWrite);
    if (cols.lastUpdate > 0) sheet.getRange(rowIndex, cols.lastUpdate).setValue(lastUpdateToWrite);
    if (cols.dataUscita > 0 && isCompleted) {
      sheet.getRange(rowIndex, cols.dataUscita).setValue(stamp);
    }
    SpreadsheetApp.flush();
  } catch (werr) {
    return { success: false, reason: 'write_error', error: String(werr), row: rowIndex };
  }

  return {
    success:    true,
    row:        rowIndex,
    status:     statusToWrite,
    lastUpdate: lastUpdateToWrite,
    dataUscita: isCompleted ? stamp : ''
  };
}
