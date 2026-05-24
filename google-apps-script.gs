const SHEETS = {
  CONFIG: 'Config',
  QUICK_PRODUCTS: 'ProdukFavorit',
  ONLINE_ORDERS: 'PesananOnline',
  TRANSACTIONS: 'Transaksi',
  TRANSACTION_ITEMS: 'DetailTransaksi'
};

const HEADERS = {
  [SHEETS.CONFIG]: ['key', 'value'],
  [SHEETS.QUICK_PRODUCTS]: ['nama', 'harga'],
  [SHEETS.ONLINE_ORDERS]: ['id', 'customerName', 'source', 'note', 'createdAt', 'status', 'itemsJson'],
  [SHEETS.TRANSACTIONS]: [
    'nomor',
    'waktu',
    'pelanggan',
    'kasir',
    'sumberTransaksi',
    'metodeBayar',
    'catatan',
    'totalItem',
    'subtotal',
    'diskonPersen',
    'diskon',
    'pajakPersen',
    'pajak',
    'grandTotal',
    'uangBayar',
    'kembali',
    'itemsJson'
  ],
  [SHEETS.TRANSACTION_ITEMS]: ['nomor', 'waktu', 'nama', 'harga', 'qty', 'subtotal']
};

function doGet(e) {
  const action = e.parameter.action || 'loadState';
  const callback = e.parameter.callback || '';
  const result = handleAction(action, null);
  const body = callback ? `${callback}(${JSON.stringify(result)});` : JSON.stringify(result);

  return ContentService
    .createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  const action = e.parameter.action || '';
  const payload = parseJSON(e.parameter.payload, {});
  const result = handleAction(action, payload);

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleAction(action, payload) {
  setupDatabase();

  if (action === 'loadState') return loadState();
  if (action === 'saveState') return saveState(payload || {});
  if (action === 'appendTransaction') return appendTransaction(payload || {});
  if (action === 'clearHistory') return clearHistory();

  return { ok: false, message: 'Action tidak dikenal.' };
}

function setupDatabase() {
  Object.keys(HEADERS).forEach((sheetName) => {
    const sheet = getSheet(sheetName);
    const headers = HEADERS[sheetName];
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const needsHeader = headers.some((header, index) => current[index] !== header);

    if (needsHeader) {
      sheet.clear();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
}

function getSheet(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function saveState(payload) {
  saveConfig(payload);
  saveQuickProducts(payload.quickProducts || []);
  saveOnlineOrders(payload.onlineOrders || []);

  return { ok: true, message: 'Data berhasil disimpan.' };
}

function saveConfig(payload) {
  const sheet = getSheet(SHEETS.CONFIG);
  sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 2).clearContent();
  sheet.getRange(2, 1, 2, 2).setValues([
    ['profile', JSON.stringify(payload.profile || {})],
    ['store', JSON.stringify(payload.store || {})]
  ]);
}

function saveQuickProducts(items) {
  const sheet = getSheet(SHEETS.QUICK_PRODUCTS);
  clearDataRows(sheet);

  const rows = items
    .filter((item) => item && item.nama)
    .map((item) => [String(item.nama), Number(item.harga || 0)]);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
}

function saveOnlineOrders(items) {
  const sheet = getSheet(SHEETS.ONLINE_ORDERS);
  clearDataRows(sheet);

  const rows = items
    .filter((item) => item && item.id)
    .map((item) => [
      String(item.id),
      String(item.customerName || ''),
      String(item.source || ''),
      String(item.note || ''),
      String(item.createdAt || ''),
      String(item.status || ''),
      JSON.stringify(item.items || [])
    ]);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, HEADERS[SHEETS.ONLINE_ORDERS].length).setValues(rows);
  }
}

function appendTransaction(transaction) {
  const sheet = getSheet(SHEETS.TRANSACTIONS);
  const itemSheet = getSheet(SHEETS.TRANSACTION_ITEMS);
  const items = Array.isArray(transaction.items) ? transaction.items : [];

  sheet.appendRow([
    transaction.nomor || '',
    transaction.waktu || new Date().toISOString(),
    transaction.pelanggan || '',
    transaction.kasir || '',
    transaction.sumberTransaksi || '',
    transaction.metodeBayar || '',
    transaction.catatan || '',
    Number(transaction.totalItem || 0),
    Number(transaction.subtotal || 0),
    Number(transaction.diskonPersen || 0),
    Number(transaction.diskon || 0),
    Number(transaction.pajakPersen || 0),
    Number(transaction.pajak || 0),
    Number(transaction.grandTotal || 0),
    Number(transaction.uangBayar || 0),
    Number(transaction.kembali || 0),
    JSON.stringify(items)
  ]);

  if (items.length) {
    const rows = items.map((item) => [
      transaction.nomor || '',
      transaction.waktu || new Date().toISOString(),
      item.nama || '',
      Number(item.harga || 0),
      Number(item.qty || 0),
      Number(item.subtotal || 0)
    ]);
    itemSheet.getRange(itemSheet.getLastRow() + 1, 1, rows.length, HEADERS[SHEETS.TRANSACTION_ITEMS].length).setValues(rows);
  }

  return { ok: true, message: 'Transaksi berhasil ditambahkan.' };
}

function clearHistory() {
  clearDataRows(getSheet(SHEETS.TRANSACTIONS));
  clearDataRows(getSheet(SHEETS.TRANSACTION_ITEMS));
  return { ok: true, message: 'Riwayat berhasil dikosongkan.' };
}

function loadState() {
  return {
    ok: true,
    profile: loadConfigValue('profile', {}),
    store: loadConfigValue('store', {}),
    quickProducts: loadQuickProducts(),
    onlineOrders: loadOnlineOrders(),
    history: loadTransactions()
  };
}

function loadConfigValue(key, fallback) {
  const sheet = getSheet(SHEETS.CONFIG);
  const values = getRows(sheet);
  const row = values.find((item) => item[0] === key);
  return row ? parseJSON(row[1], fallback) : fallback;
}

function loadQuickProducts() {
  return getRows(getSheet(SHEETS.QUICK_PRODUCTS)).map((row) => ({
    nama: String(row[0] || ''),
    harga: Number(row[1] || 0)
  }));
}

function loadOnlineOrders() {
  return getRows(getSheet(SHEETS.ONLINE_ORDERS)).map((row) => ({
    id: String(row[0] || ''),
    customerName: String(row[1] || ''),
    source: String(row[2] || ''),
    note: String(row[3] || ''),
    createdAt: String(row[4] || ''),
    status: String(row[5] || ''),
    items: parseJSON(row[6], [])
  }));
}

function loadTransactions() {
  return getRows(getSheet(SHEETS.TRANSACTIONS))
    .map((row) => ({
      nomor: String(row[0] || ''),
      waktu: String(row[1] || ''),
      pelanggan: String(row[2] || ''),
      kasir: String(row[3] || ''),
      sumberTransaksi: String(row[4] || ''),
      metodeBayar: String(row[5] || ''),
      catatan: String(row[6] || ''),
      totalItem: Number(row[7] || 0),
      grandTotal: Number(row[13] || 0),
      items: parseJSON(row[16], [])
    }))
    .reverse();
}

function getRows(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
}

function clearDataRows(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
  }
}

function parseJSON(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}
