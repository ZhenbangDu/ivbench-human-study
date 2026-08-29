const STUDY_VERSION = 'act-h3-v1';
const MAX_PAYLOAD_LENGTH = 25000;

const SESSION_HEADERS = [
  'session_id',
  'participant_code',
  'nickname',
  'study_version',
  'started_at',
  'last_seen_at',
  'answered_count',
  'status',
  'completed_at',
  'completion_code',
];

const RESPONSE_HEADERS = [
  'response_key',
  'session_id',
  'study_version',
  'trial_id',
  'item_id',
  'trial_index',
  'first_position_video_code',
  'second_position_video_code',
  'information_choice',
  'placement_choice',
  'overall_choice',
  'replay_count',
  'elapsed_ms',
  'device_layout',
  'edited',
  'created_at',
  'updated_at',
];

const METHOD_MAP_HEADERS = [
  'study_version',
  'trial_id',
  'video_code',
  'method',
  'source_path',
];

function safeCell(value) {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

function isObject_(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validTrialId_(trialId) {
  if (typeof trialId !== 'string') return false;
  const match = /^trial_(\d{3})$/.exec(trialId);
  if (!match) return false;
  const number = Number(match[1]);
  return number >= 1 && number <= 30;
}

function validChoice_(choice, trialId) {
  if (choice === null || choice === undefined || choice === 'same') return true;
  const item = trialId.slice(-3);
  return choice === 'v' + item + 'a' || choice === 'v' + item + 'b';
}

function validatePayload(envelope) {
  if (!isObject_(envelope)) return { ok: false, error: 'invalid_envelope' };
  if (typeof envelope.requestId !== 'string' || envelope.requestId.length > 180) {
    return { ok: false, error: 'invalid_request_id' };
  }
  if (envelope.type !== 'session' && envelope.type !== 'response') {
    return { ok: false, error: 'invalid_record_type' };
  }
  const payload = envelope.payload;
  if (!isObject_(payload)) return { ok: false, error: 'invalid_payload' };
  if (payload.studyVersion !== STUDY_VERSION) {
    return { ok: false, error: 'invalid_study_version' };
  }
  if (typeof payload.sessionId !== 'string' || payload.sessionId.length < 8 || payload.sessionId.length > 100) {
    return { ok: false, error: 'invalid_session_id' };
  }

  if (envelope.type === 'session') {
    if (typeof payload.nickname !== 'string' || payload.nickname.length > 60) {
      return { ok: false, error: 'invalid_nickname' };
    }
    if (payload.status !== 'in_progress' && payload.status !== 'completed') {
      return { ok: false, error: 'invalid_session_status' };
    }
    return { ok: true };
  }

  if (!validTrialId_(payload.trialId)) {
    return { ok: false, error: 'invalid_trial_id' };
  }
  const choices = [payload.informationChoice, payload.placementChoice, payload.overallChoice];
  if (!choices.every(function (choice) { return validChoice_(choice, payload.trialId); })) {
    return { ok: false, error: 'invalid_choice' };
  }
  if (!['desktop', 'portrait', 'landscape', undefined].includes(payload.deviceLayout)) {
    return { ok: false, error: 'invalid_device_layout' };
  }
  return { ok: true };
}

function output_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID is not configured');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function findRow_(sheet, column, key) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, column, lastRow - 1, 1).getValues();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0]) === String(key)) return index + 2;
  }
  return -1;
}

function upsertRow_(sheet, keyColumn, key, rowValues) {
  const values = rowValues.map(safeCell);
  const row = findRow_(sheet, keyColumn, key);
  if (row === -1) {
    sheet.appendRow(values);
    return;
  }
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

function completeResponseCount_(responses, sessionId) {
  if (responses.getLastRow() < 2) return 0;
  const rows = responses.getRange(2, 1, responses.getLastRow() - 1, RESPONSE_HEADERS.length).getValues();
  return rows.filter(function (row) {
    return row[1] === sessionId && row[8] && row[9] && row[10];
  }).length;
}

function updateSessionProgress_(sessions, responses, sessionId, now) {
  const row = findRow_(sessions, 1, sessionId);
  if (row === -1) return;
  sessions.getRange(row, 6).setValue(now);
  sessions.getRange(row, 7).setValue(completeResponseCount_(responses, sessionId));
}

function upsertSession_(sessions, responses, payload, now) {
  const answeredCount = completeResponseCount_(responses, payload.sessionId);
  const completed = payload.status === 'completed' && answeredCount === 30;
  const values = [
    payload.sessionId,
    payload.participantCode,
    payload.nickname,
    payload.studyVersion,
    payload.startedAt,
    now,
    answeredCount,
    completed ? 'completed' : 'in_progress',
    completed ? now : '',
    completed ? payload.completionCode : '',
  ];
  upsertRow_(sessions, 1, payload.sessionId, values);
}

function upsertResponse_(sessions, responses, payload, now) {
  const existingRow = findRow_(responses, 1, payload.requestId);
  const createdAt = existingRow === -1
    ? now
    : responses.getRange(existingRow, 16).getValue();
  const values = [
    payload.requestId,
    payload.sessionId,
    payload.studyVersion,
    payload.trialId,
    payload.itemId,
    Number(payload.trialIndex),
    payload.firstPositionVideoCode,
    payload.secondPositionVideoCode,
    payload.informationChoice || '',
    payload.placementChoice || '',
    payload.overallChoice || '',
    Number(payload.replayCount || 0),
    Number(payload.elapsedMs || 0),
    payload.deviceLayout || '',
    Boolean(payload.edited),
    createdAt,
    now,
  ];
  upsertRow_(responses, 1, payload.requestId, values);
  updateSessionProgress_(sessions, responses, payload.sessionId, now);
}

function setupSheet() {
  const spreadsheet = spreadsheet_();
  ensureSheet_(spreadsheet, 'Sessions', SESSION_HEADERS);
  ensureSheet_(spreadsheet, 'Responses', RESPONSE_HEADERS);
  ensureSheet_(spreadsheet, 'MethodMap', METHOD_MAP_HEADERS);
}

function doGet() {
  return output_({ ok: true, studyVersion: STUDY_VERSION });
}

function doPost(e) {
  const raw = e && e.parameter ? e.parameter.payload : '';
  if (!raw || raw.length > MAX_PAYLOAD_LENGTH) {
    return output_({ ok: false, error: 'invalid_payload_size' });
  }

  try {
    const envelope = JSON.parse(raw);
    const validation = validatePayload(envelope);
    if (!validation.ok) return output_(validation);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const spreadsheet = spreadsheet_();
      const sessions = ensureSheet_(spreadsheet, 'Sessions', SESSION_HEADERS);
      const responses = ensureSheet_(spreadsheet, 'Responses', RESPONSE_HEADERS);
      const now = new Date().toISOString();
      if (envelope.type === 'session') {
        upsertSession_(sessions, responses, envelope.payload, now);
      } else {
        upsertResponse_(sessions, responses, envelope.payload, now);
      }
    } finally {
      lock.releaseLock();
    }

    return output_({ ok: true, requestId: envelope.requestId });
  } catch (error) {
    console.error(error);
    return output_({ ok: false, error: 'server_error' });
  }
}
