/**
 * Admin Panel JS – Street View Takengon
 * Vanilla ES module, no framework.
 */

// =====================================================
// API helpers
// =====================================================
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const b = await res.json(); msg = b.error?.message ?? msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

async function apiUpload(url, formData) {
  const res = await fetch(url, { method: 'POST', credentials: 'include', body: formData });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const b = await res.json(); msg = b.error?.message ?? msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// =====================================================
// DOM helpers
// =====================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el) { el?.classList.remove('hidden'); }
function hide(el) { el?.classList.add('hidden'); }
function setError(el, msg) { if (el) el.textContent = msg; }
function clearError(el) { if (el) el.textContent = ''; }

function statusBadge(status) {
  const map = { draft: 'Draft', published: 'Terbit', hidden: 'Disembunyikan', open: 'Belum ditangani', resolved: 'Selesai' };
  return `<span class="status-badge status-${status}">${map[status] ?? status}</span>`;
}

// =====================================================
// Screen management
// =====================================================
function showLogin() {
  hide($('#screen-dashboard'));
  show($('#screen-login'));
}
function showDashboard() {
  hide($('#screen-login'));
  show($('#screen-dashboard'));
  loadPanel('sequences');
  loadReportBadge();
}

// =====================================================
// Auth
// =====================================================
async function checkAuth() {
  try {
    // A quick authenticated call to verify session
    await apiFetch('/api/admin/sequences');
    return true;
  } catch {
    return false;
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const errEl = $('#login-error');
  clearError(errEl);
  btn.disabled = true;
  btn.textContent = 'Masuk...';
  try {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    await apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    showDashboard();
  } catch (err) {
    setError(errEl, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
});

$('#logout-btn').addEventListener('click', async () => {
  try { await apiFetch('/api/admin/logout', { method: 'POST' }); } catch {}
  showLogin();
});

// =====================================================
// Navigation
// =====================================================
$$('.nav-item[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadPanel(btn.dataset.panel);
  });
});

function showPanel(name) {
  $$('.panel').forEach(p => p.classList.remove('active'));
  $(`#panel-${name}`)?.classList.add('active');
}

function loadPanel(name) {
  showPanel(name);
  switch (name) {
    case 'sequences': loadSequences(); break;
    case 'photos': loadPhotos(); break;
    case 'places': loadPlaces(); break;
    case 'reports': loadReports(); break;
    case 'settings': loadAreas(); break;
  }
}

// =====================================================
// SEQUENCES
// =====================================================
async function loadSequences() {
  const loading = $('#sequences-loading');
  const table = $('#sequences-table');
  const tbody = $('#sequences-tbody');
  show(loading); hide(table);

  try {
    const seqs = await apiFetch('/api/admin/sequences');
    tbody.innerHTML = seqs.map(s => `
      <tr>
        <td>${s.id}</td>
        <td>${escHtml(s.title)}</td>
        <td>${escHtml(s.camera ?? '—')}</td>
        <td>${statusBadge(s.status)}</td>
        <td class="td-actions">
          ${s.status !== 'published' ? `<button class="btn-success btn-sm" onclick="changeSeqStatus(${s.id},'published')">Terbitkan</button>` : ''}
          ${s.status !== 'hidden' ? `<button class="btn-sm btn-secondary" onclick="changeSeqStatus(${s.id},'hidden')">Sembunyikan</button>` : ''}
          ${s.status !== 'draft' ? `<button class="btn-sm btn-secondary" onclick="changeSeqStatus(${s.id},'draft')">Jadikan Draft</button>` : ''}
          <button class="btn-sm btn-secondary" onclick="openUploadForm(${s.id},'${escHtml(s.title)}')">📤 Upload Video</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#5f6368">Belum ada sequence</td></tr>';
    hide(loading); show(table);
  } catch (err) {
    loading.textContent = 'Gagal memuat: ' + err.message;
  }
}

window.changeSeqStatus = async (id, status) => {
  try {
    await apiFetch(`/api/admin/sequences/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadSequences();
  } catch (err) { alert('Gagal: ' + err.message); }
};

// New sequence form
$('#btn-new-sequence').addEventListener('click', () => {
  show($('#form-new-sequence'));
  $('#btn-new-sequence').disabled = true;
});
$('#btn-cancel-sequence').addEventListener('click', () => {
  hide($('#form-new-sequence'));
  $('#btn-new-sequence').disabled = false;
  clearError($('#seq-form-error'));
});
$('#btn-create-sequence').addEventListener('click', async () => {
  const title = $('#seq-title').value.trim();
  const camera = $('#seq-camera').value.trim();
  clearError($('#seq-form-error'));
  if (!title) return setError($('#seq-form-error'), 'Judul wajib diisi');
  try {
    await apiFetch('/api/admin/sequences', {
      method: 'POST',
      body: JSON.stringify({ title, camera: camera || undefined }),
    });
    hide($('#form-new-sequence'));
    $('#btn-new-sequence').disabled = false;
    $('#seq-title').value = ''; $('#seq-camera').value = '';
    loadSequences();
  } catch (err) { setError($('#seq-form-error'), err.message); }
});

// Upload video form
let uploadingSeqId = null;
function openUploadForm(id, title) {
  uploadingSeqId = id;
  $('#upload-seq-title').textContent = `"${title}"`;
  show($('#form-upload-video'));
  hide($('#upload-progress'));
  clearError($('#upload-error'));
  $('#upload-video-file').value = '';
  $('#upload-gpx-file').value = '';
}
$('#btn-cancel-upload').addEventListener('click', () => {
  hide($('#form-upload-video'));
  uploadingSeqId = null;
});
$('#btn-do-upload').addEventListener('click', async () => {
  clearError($('#upload-error'));
  const video = $('#upload-video-file').files[0];
  const gpx = $('#upload-gpx-file').files[0];
  if (!video) return setError($('#upload-error'), 'Pilih file video MP4');
  if (!gpx) return setError($('#upload-error'), 'Pilih file GPX');

  const fd = new FormData();
  fd.append('video', video);
  fd.append('gpx', gpx);

  show($('#upload-progress'));
  $('#progress-fill').style.width = '30%';
  $('#upload-status').textContent = 'Mengunggah file...';
  $('#btn-do-upload').disabled = true;

  try {
    const res = await apiUpload(`/api/admin/sequences/${uploadingSeqId}/upload`, fd);
    $('#progress-fill').style.width = '100%';
    $('#upload-status').textContent = res.message || 'Diterima — sedang diproses di latar belakang';
    setTimeout(() => {
      hide($('#form-upload-video'));
      hide($('#upload-progress'));
      uploadingSeqId = null;
      loadSequences();
    }, 2000);
  } catch (err) {
    hide($('#upload-progress'));
    setError($('#upload-error'), err.message);
  } finally {
    $('#btn-do-upload').disabled = false;
  }
});

// =====================================================
// PHOTOS
// =====================================================
async function loadPhotos() {
  const loading = $('#photos-loading');
  const table = $('#photos-table');
  const tbody = $('#photos-tbody');
  show(loading); hide(table);

  const status = $('#photo-filter-status').value;
  const qs = status ? `?status=${status}` : '';

  try {
    const photos = await apiFetch('/api/admin/photos' + qs);
    tbody.innerHTML = photos.map(p => `
      <tr>
        <td>${p.id}</td>
        <td>
          ${p.thumb_path
            ? `<img src="${escHtml(p.thumb_path)}" class="table-thumb" loading="lazy" onerror="this.style.display='none'" />`
            : `<div class="table-thumb-placeholder">📷</div>`}
        </td>
        <td>${Number(p.lat).toFixed(5)}</td>
        <td>${Number(p.lon).toFixed(5)}</td>
        <td>${Number(p.heading_deg).toFixed(1)}°</td>
        <td>${statusBadge(p.status)}</td>
        <td class="td-actions">
          ${p.status !== 'published' ? `<button class="btn-success btn-sm" onclick="changePhotoStatus(${p.id},'published')">Terbitkan</button>` : ''}
          ${p.status !== 'hidden' ? `<button class="btn-sm btn-secondary" onclick="changePhotoStatus(${p.id},'hidden')">Sembunyikan</button>` : ''}
          ${p.status !== 'draft' ? `<button class="btn-sm btn-secondary" onclick="changePhotoStatus(${p.id},'draft')">Draft</button>` : ''}
          <button class="btn-danger btn-sm" onclick="deletePhoto(${p.id})">Hapus</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#5f6368">Belum ada foto</td></tr>';
    hide(loading); show(table);
  } catch (err) {
    loading.textContent = 'Gagal memuat: ' + err.message;
  }
}

$('#btn-reload-photos').addEventListener('click', loadPhotos);
$('#photo-filter-status').addEventListener('change', loadPhotos);

window.changePhotoStatus = async (id, status) => {
  try {
    await apiFetch(`/api/admin/photos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadPhotos();
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.deletePhoto = async (id) => {
  if (!confirm(`Hapus foto #${id}? Tindakan ini tidak dapat dibatalkan.`)) return;
  try {
    await apiFetch(`/api/admin/photos/${id}`, { method: 'DELETE' });
    loadPhotos();
  } catch (err) { alert('Gagal: ' + err.message); }
};

// Photo upload form
let adminPsvViewer = null;

$('#photo-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  hide($('#photo-preview-wrap'));
  hide($('#photo-upload-success'));
  clearError($('#photo-upload-error'));

  const url = URL.createObjectURL(file);
  const wrap = $('#photo-preview-wrap');
  const infoEl = $('#photo-preview-info');
  const psvEl = $('#photo-preview-psv');

  // Get image dimensions first
  const img = new Image();
  img.onload = async () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const ratio = (w / h).toFixed(2);
    infoEl.textContent = `${w} × ${h} px · Rasio ${ratio}:1`;
    URL.revokeObjectURL(url);

    show(wrap);

    // Destroy previous PSV viewer if any
    if (adminPsvViewer) {
      try { adminPsvViewer.destroy(); } catch {}
      adminPsvViewer = null;
    }
    psvEl.innerHTML = '';

    // Compute panoData for partial panoramas (same logic as server)
    let panoData = undefined;
    const ratioNum = w / h;
    if (ratioNum < 1.9 || ratioNum > 2.1) {
      const fullWidth  = w;
      const fullHeight = Math.round(w / 2);
      const croppedX   = 0;
      const croppedY   = Math.max(0, Math.round((fullHeight - h) / 2));
      panoData = { fullWidth, fullHeight, croppedWidth: w, croppedHeight: h, croppedX, croppedY };
    }

    // Dynamically import PSV (bundled by Vite)
    try {
      const { Viewer } = await import('@photo-sphere-viewer/core');
      adminPsvViewer = new Viewer({
        container:    psvEl,
        panorama:     URL.createObjectURL(file),
        panoData,
        defaultZoomLvl: 50,
        minFov: 30,
        maxFov: 120,
        touchmoveTwoFingers: false,
        navbar: false,
        loadingImg: undefined,
      });
    } catch (err) {
      console.warn('PSV preview failed, fallback to flat:', err);
      psvEl.innerHTML = `<img src="${URL.createObjectURL(file)}" style="width:100%;height:320px;object-fit:contain;background:#111">`;
    }
  };
  img.src = url;
});

$('#btn-upload-photo').addEventListener('click', async () => {
  const fileInput = $('#photo-file');
  const file = fileInput.files[0];
  clearError($('#photo-upload-error'));
  hide($('#photo-upload-success'));

  if (!file) return setError($('#photo-upload-error'), 'Pilih file foto terlebih dahulu');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('status', $('#photo-status').value);

  const lat = $('#photo-lat').value.trim();
  const lon = $('#photo-lon').value.trim();
  const heading = $('#photo-heading').value.trim();

  if (lat) fd.append('lat', lat);
  if (lon) fd.append('lon', lon);
  if (heading) fd.append('headingDeg', heading);

  const btn = $('#btn-upload-photo');
  btn.disabled = true;
  btn.textContent = 'Mengunggah...';

  try {
    const res = await apiUpload('/api/admin/photos', fd);
    const successEl = $('#photo-upload-success');
    successEl.textContent = `✅ Foto #${res.id} berhasil diunggah (${res.status}) di ${Number(res.lat).toFixed(5)}, ${Number(res.lon).toFixed(5)}`;
    show(successEl);
    fileInput.value = '';
    $('#photo-lat').value = '';
    $('#photo-lon').value = '';
    $('#photo-heading').value = '';
    hide($('#photo-preview-wrap'));
    loadPhotos();
  } catch (err) {
    setError($('#photo-upload-error'), err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Unggah Foto';
  }
});

// =====================================================
// PLACES
// =====================================================
async function loadPlaces() {
  const loading = $('#places-loading');
  const table = $('#places-table');
  const tbody = $('#places-tbody');
  show(loading); hide(table);

  try {
    const places = await apiFetch('/api/admin/places');
    tbody.innerHTML = places.map(p => `
      <tr>
        <td>${p.id}</td>
        <td>${escHtml(p.name)}</td>
        <td>${escHtml(p.category ?? '—')}</td>
        <td>${Number(p.lat).toFixed(5)}</td>
        <td>${Number(p.lon).toFixed(5)}</td>
        <td class="td-actions">
          <button class="btn-sm btn-secondary" onclick="editPlace(${p.id},'${escAttr(p.name)}','${escAttr(p.category ?? '')}',${p.lat},${p.lon})">Edit</button>
          <button class="btn-danger btn-sm" onclick="deletePlace(${p.id})">Hapus</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#5f6368">Belum ada tempat</td></tr>';
    hide(loading); show(table);
  } catch (err) {
    loading.textContent = 'Gagal memuat: ' + err.message;
  }
}

$('#btn-new-place').addEventListener('click', () => {
  $('#place-form-title').textContent = 'Tambah Tempat';
  $('#place-edit-id').value = '';
  $('#place-name').value = '';
  $('#place-category').value = '';
  $('#place-lat').value = '';
  $('#place-lon').value = '';
  clearError($('#place-form-error'));
  show($('#form-place'));
  $('#btn-new-place').disabled = true;
});

$('#btn-cancel-place').addEventListener('click', () => {
  hide($('#form-place'));
  $('#btn-new-place').disabled = false;
});

window.editPlace = (id, name, category, lat, lon) => {
  $('#place-form-title').textContent = 'Edit Tempat';
  $('#place-edit-id').value = id;
  $('#place-name').value = name;
  $('#place-category').value = category;
  $('#place-lat').value = lat;
  $('#place-lon').value = lon;
  clearError($('#place-form-error'));
  show($('#form-place'));
  $('#btn-new-place').disabled = true;
};

$('#btn-save-place').addEventListener('click', async () => {
  const id = $('#place-edit-id').value;
  const name = $('#place-name').value.trim();
  const category = $('#place-category').value.trim();
  const lat = parseFloat($('#place-lat').value);
  const lon = parseFloat($('#place-lon').value);
  clearError($('#place-form-error'));

  if (!name) return setError($('#place-form-error'), 'Nama wajib diisi');
  if (isNaN(lat) || lat < -90 || lat > 90) return setError($('#place-form-error'), 'Latitude tidak valid (−90 sampai 90)');
  if (isNaN(lon) || lon < -180 || lon > 180) return setError($('#place-form-error'), 'Longitude tidak valid (−180 sampai 180)');

  const body = { name, lat, lon, category: category || undefined };
  try {
    if (id) {
      await apiFetch(`/api/admin/places/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await apiFetch('/api/admin/places', { method: 'POST', body: JSON.stringify(body) });
    }
    hide($('#form-place'));
    $('#btn-new-place').disabled = false;
    loadPlaces();
  } catch (err) { setError($('#place-form-error'), err.message); }
});

window.deletePlace = async (id) => {
  if (!confirm('Hapus tempat ini?')) return;
  try {
    await apiFetch(`/api/admin/places/${id}`, { method: 'DELETE' });
    loadPlaces();
  } catch (err) { alert('Gagal: ' + err.message); }
};

// =====================================================
// REPORTS
// =====================================================
const reportTypeLabel = { privacy: 'Privasi', wrong_location: 'Lokasi salah', other: 'Lainnya' };

async function loadReports() {
  const loading = $('#reports-loading');
  const table = $('#reports-table');
  const tbody = $('#reports-tbody');
  show(loading); hide(table);

  const status = $('#report-filter').value;
  const qs = status ? `?status=${status}` : '';

  try {
    const reports = await apiFetch('/api/admin/reports' + qs);
    tbody.innerHTML = reports.map(r => `
      <tr>
        <td>${r.id}</td>
        <td><a href="/api/photos/${r.photo_id}" target="_blank">#${r.photo_id}</a></td>
        <td>${reportTypeLabel[r.type] ?? r.type}</td>
        <td>${escHtml(r.note ?? '—')}</td>
        <td>${new Date(r.created_at).toLocaleDateString('id-ID')}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="td-actions">
          ${r.status === 'open'
            ? `<button class="btn-success btn-sm" onclick="resolveReport(${r.id})">Selesaikan</button>`
            : '—'}
        </td>
      </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#5f6368">Tidak ada laporan</td></tr>';
    hide(loading); show(table);
  } catch (err) {
    loading.textContent = 'Gagal memuat: ' + err.message;
  }
}

$('#report-filter').addEventListener('change', loadReports);
$('#btn-reload-reports').addEventListener('click', loadReports);

window.resolveReport = async (id) => {
  try {
    await apiFetch(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    });
    loadReports();
    loadReportBadge();
  } catch (err) { alert('Gagal: ' + err.message); }
};

async function loadReportBadge() {
  try {
    const reports = await apiFetch('/api/admin/reports?status=open');
    const badge = $('#report-badge');
    if (reports.length > 0) {
      badge.textContent = reports.length;
      show(badge);
    } else {
      hide(badge);
    }
  } catch {}
}

// =====================================================
// SETTINGS (Map Areas)
// =====================================================
async function loadAreas() {
  const loading = $('#areas-loading');
  const table = $('#areas-table');
  const tbody = $('#areas-tbody');
  show(loading); hide(table);

  try {
    const areas = await apiFetch('/api/admin/map-areas');
    tbody.innerHTML = areas.map(a => `
      <tr>
        <td>${a.id}</td>
        <td>${escHtml(a.name)}</td>
        <td>${Number(a.center_lat).toFixed(4)}, ${Number(a.center_lon).toFixed(4)}</td>
        <td>${a.zoom}</td>
        <td>${a.min_lat != null ? `${Number(a.min_lat).toFixed(2)}–${Number(a.max_lat).toFixed(2)}, ${Number(a.min_lon).toFixed(2)}–${Number(a.max_lon).toFixed(2)}` : '—'}</td>
        <td>${a.is_active ? '<span class="status-badge status-active">Aktif</span>' : '—'}</td>
        <td class="td-actions">
          ${!a.is_active ? `<button class="btn-success btn-sm" onclick="activateArea(${a.id})">Aktifkan</button>` : ''}
          <button class="btn-sm btn-secondary" onclick="editArea(${a.id})">Edit</button>
          ${!a.is_active ? `<button class="btn-danger btn-sm" onclick="deleteArea(${a.id})">Hapus</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#5f6368">Belum ada wilayah</td></tr>';
    hide(loading); show(table);
  } catch (err) {
    loading.textContent = 'Gagal memuat: ' + err.message;
  }
}

$('#btn-new-area').addEventListener('click', () => {
  $('#area-form-title').textContent = 'Tambah Wilayah';
  $('#area-edit-id').value = '';
  $('#area-name').value = ''; $('#area-center-lat').value = '';
  $('#area-center-lon').value = ''; $('#area-zoom').value = '12';
  $('#area-min-lat').value = ''; $('#area-max-lat').value = '';
  $('#area-min-lon').value = ''; $('#area-max-lon').value = '';
  clearError($('#area-form-error'));
  show($('#form-area'));
  $('#btn-new-area').disabled = true;
});

$('#btn-cancel-area').addEventListener('click', () => {
  hide($('#form-area'));
  $('#btn-new-area').disabled = false;
});

window.editArea = async (id) => {
  try {
    const areas = await apiFetch('/api/admin/map-areas');
    const a = areas.find(x => x.id === id);
    if (!a) return;
    $('#area-form-title').textContent = 'Edit Wilayah';
    $('#area-edit-id').value = a.id;
    $('#area-name').value = a.name;
    $('#area-center-lat').value = a.center_lat;
    $('#area-center-lon').value = a.center_lon;
    $('#area-zoom').value = a.zoom;
    $('#area-min-lat').value = a.min_lat ?? '';
    $('#area-max-lat').value = a.max_lat ?? '';
    $('#area-min-lon').value = a.min_lon ?? '';
    $('#area-max-lon').value = a.max_lon ?? '';
    clearError($('#area-form-error'));
    show($('#form-area'));
    $('#btn-new-area').disabled = true;
  } catch (err) { alert('Gagal: ' + err.message); }
};

$('#btn-save-area').addEventListener('click', async () => {
  const id = $('#area-edit-id').value;
  const name = $('#area-name').value.trim();
  const centerLat = parseFloat($('#area-center-lat').value);
  const centerLon = parseFloat($('#area-center-lon').value);
  const zoom = parseInt($('#area-zoom').value, 10);
  const minLat = $('#area-min-lat').value.trim() ? parseFloat($('#area-min-lat').value) : undefined;
  const maxLat = $('#area-max-lat').value.trim() ? parseFloat($('#area-max-lat').value) : undefined;
  const minLon = $('#area-min-lon').value.trim() ? parseFloat($('#area-min-lon').value) : undefined;
  const maxLon = $('#area-max-lon').value.trim() ? parseFloat($('#area-max-lon').value) : undefined;

  clearError($('#area-form-error'));
  if (!name) return setError($('#area-form-error'), 'Nama wajib diisi');
  if (isNaN(centerLat)) return setError($('#area-form-error'), 'Latitude pusat tidak valid');
  if (isNaN(centerLon)) return setError($('#area-form-error'), 'Longitude pusat tidak valid');
  if (isNaN(zoom) || zoom < 1 || zoom > 19) return setError($('#area-form-error'), 'Zoom harus 1–19');

  const body = { name, centerLat, centerLon, zoom, minLat, maxLat, minLon, maxLon };
  try {
    if (id) {
      await apiFetch(`/api/admin/map-areas/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await apiFetch('/api/admin/map-areas', { method: 'POST', body: JSON.stringify(body) });
    }
    hide($('#form-area'));
    $('#btn-new-area').disabled = false;
    loadAreas();
  } catch (err) { setError($('#area-form-error'), err.message); }
});

window.activateArea = async (id) => {
  try {
    await apiFetch(`/api/admin/map-areas/${id}/activate`, { method: 'POST' });
    loadAreas();
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.deleteArea = async (id) => {
  if (!confirm('Hapus wilayah ini?')) return;
  try {
    await apiFetch(`/api/admin/map-areas/${id}`, { method: 'DELETE' });
    loadAreas();
  } catch (err) { alert('Gagal: ' + err.message); }
};

// =====================================================
// Security helpers
// =====================================================
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(str) {
  if (str == null) return '';
  return String(str).replace(/'/g, "\\'");
}

// =====================================================
// Boot
// =====================================================
(async () => {
  const ok = await checkAuth();
  if (ok) {
    showDashboard();
  } else {
    showLogin();
  }
})();
