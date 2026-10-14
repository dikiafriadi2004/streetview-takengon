/**
 * Admin Panel v2.0 - JavaScript
 * Modern, simplified admin experience
 */

// =========================================================
// UTILITIES
// =========================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el) { el?.classList.remove('hidden'); }
function hide(el) { el?.classList.add('hidden'); }

function escHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =========================================================
// API CLIENT
// =========================================================
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error?.message ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

async function apiUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = (e.loaded / e.total) * 100;
        onProgress(percent);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({});
        }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText);
          msg = body.error?.message ?? msg;
        } catch {}
        reject(new Error(msg));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Network error'));
    });
    
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

// =========================================================
// TOAST NOTIFICATIONS
// =========================================================
function showToast(title, message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${escHtml(title)}</div>
      ${message ? `<div class="toast-message">${escHtml(message)}</div>` : ''}
    </div>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideInRight 300ms reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// =========================================================
// MODAL SYSTEM
// =========================================================
let currentModal = null;

function showModal(content) {
  const overlay = $('#modal-overlay');
  overlay.innerHTML = content;
  show(overlay);
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  
  // Close button
  const closeBtn = overlay.querySelector('.modal-close');
  closeBtn?.addEventListener('click', closeModal);
  
  return overlay;
}

function closeModal() {
  const overlay = $('#modal-overlay');
  hide(overlay);
  overlay.innerHTML = '';
}

// =========================================================
// AUTH
// =========================================================
async function checkAuth() {
  try {
    await apiFetch('/api/admin/sequences');
    return true;
  } catch {
    return false;
  }
}

function showLogin() {
  hide($('#screen-dashboard'));
  show($('#screen-login'));
  hide($('#fab-main'));
}

function showDashboard() {
  hide($('#screen-login'));
  show($('#screen-dashboard'));
  show($('#fab-main'));
  loadStats();
  loadPhotos();
}

// Login form
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const errEl = $('#login-error');
  errEl.textContent = '';
  
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
    showToast('Selamat datang!', 'Login berhasil', 'success');
  } catch (err) {
    errEl.textContent = err.message;
    showToast('Login gagal', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
});

// Logout
$('#btn-logout').addEventListener('click', async () => {
  try {
    await apiFetch('/api/admin/logout', { method: 'POST' });
  } catch {}
  showLogin();
  showToast('Logout berhasil', '', 'info');
});

// User menu toggle
$('#user-avatar').addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = $('#user-dropdown');
  dropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  hide($('#user-dropdown'));
});

// =========================================================
// TABS
// =========================================================
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetId = tab.dataset.tab;
    
    // Update tab state
    $$('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update content
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    $(`#tab-${targetId}`)?.classList.add('active');
    
    // Load data
    switch(targetId) {
      case 'photos': loadPhotos(); break;
      case 'sequences': loadSequences(); break;
      case 'places': loadPlaces(); break;
      case 'reports': loadReports(); break;
      case 'settings': loadSettings(); break;
    }
  });
});

// =========================================================
// STATS
// =========================================================
async function loadStats() {
  try {
    const [photos, sequences, places, reports] = await Promise.all([
      apiFetch('/api/admin/photos'),
      apiFetch('/api/admin/sequences'),
      apiFetch('/api/admin/places'),
      apiFetch('/api/admin/reports?status=open'),
    ]);
    
    $('#stat-photos').textContent = photos.length;
    $('#stat-sequences').textContent = sequences.length;
    $('#stat-places').textContent = places.length;
    $('#stat-reports').textContent = reports.length;
    
    // Highlight reports if any
    if (reports.length > 0) {
      $('#stat-card-reports').style.animation = 'pulse 2s ease-in-out infinite';
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// =========================================================
// PHOTOS
// =========================================================
let allPhotos = [];
let displayedPhotos = 0;
const PHOTOS_PER_PAGE = 12;

async function loadPhotos() {
  const grid = $('#photos-grid');
  const filter = $('#photo-status-filter').value;
  
  grid.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;
  
  try {
    const url = filter ? `/api/admin/photos?status=${filter}` : '/api/admin/photos';
    allPhotos = await apiFetch(url);
    displayedPhotos = 0;
    displayMorePhotos();
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:var(--gray-600)">Gagal memuat: ${escHtml(err.message)}</div>`;
  }
}

function displayMorePhotos() {
  const grid = $('#photos-grid');
  const loadMoreWrap = $('#photos-load-more-wrap');
  
  if (displayedPhotos === 0) {
    grid.innerHTML = '';
  }
  
  const nextPhotos = allPhotos.slice(displayedPhotos, displayedPhotos + PHOTOS_PER_PAGE);
  displayedPhotos += nextPhotos.length;
  
  nextPhotos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.innerHTML = `
      <div class="photo-card-image">
        ${photo.thumb_path 
          ? `<img src="${escHtml(photo.thumb_path)}" alt="Foto #${photo.id}" loading="lazy" />`
          : '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:48px">📷</div>'}
      </div>
      <div class="photo-card-body">
        <div class="photo-card-id">#${photo.id}</div>
        <div class="photo-card-coords">${Number(photo.lat).toFixed(5)}, ${Number(photo.lon).toFixed(5)}</div>
        <div class="photo-card-status ${photo.status}">${statusLabel(photo.status)}</div>
        <div class="photo-card-actions">
          <button class="btn btn-sm btn-secondary" onclick="viewPhoto(${photo.id})">👁️ Lihat</button>
          <button class="btn btn-sm btn-secondary" onclick="editPhoto(${photo.id})">✏️ Edit</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
  
  if (displayedPhotos < allPhotos.length) {
    show(loadMoreWrap);
  } else {
    hide(loadMoreWrap);
  }
  
  if (allPhotos.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:var(--gray-600); padding: var(--space-xl)">Belum ada foto</div>';
  }
}

$('#photos-load-more').addEventListener('click', displayMorePhotos);
$('#photo-status-filter').addEventListener('change', loadPhotos);

function statusLabel(status) {
  const labels = {
    published: 'Terbit',
    draft: 'Draft',
    hidden: 'Disembunyikan'
  };
  return labels[status] || status;
}

window.viewPhoto = async (id) => {
  try {
    const photo = await apiFetch(`/api/photos/${id}`);
    showModal(`
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Foto #${id}</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div id="modal-photo-viewer" style="width:100%;height:400px;background:#000;border-radius:8px;margin-bottom:16px"></div>
          <div style="font-size:13px;color:var(--gray-600)">
            <p><strong>Koordinat:</strong> ${Number(photo.lat).toFixed(6)}, ${Number(photo.lon).toFixed(6)}</p>
            <p><strong>Arah:</strong> ${Number(photo.headingDeg).toFixed(1)}°</p>
            <p><strong>Status:</strong> ${statusLabel(photo.status)}</p>
          </div>
        </div>
      </div>
    `);
    
    // Load PSV if available
    loadPhotoViewer(photo);
  } catch (err) {
    showToast('Gagal memuat foto', err.message, 'error');
  }
};

async function loadPhotoViewer(photo) {
  const container = $('#modal-photo-viewer');
  if (!container) return;
  
  try {
    const { Viewer } = await import('@photo-sphere-viewer/core');
    new Viewer({
      container,
      panorama: photo.imagePath,
      panoData: photo.panoData,
      defaultYaw: (photo.headingDeg * Math.PI) / 180,
      minFov: 30,
      maxFov: 120,
      navbar: false,
    });
  } catch (err) {
    container.innerHTML = `<img src="${photo.imagePath}" style="width:100%;height:100%;object-fit:contain">`;
  }
}

window.editPhoto = async (id) => {
  try {
    const photo = await apiFetch(`/api/photos/${id}`);
    showModal(`
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Edit Foto #${id}</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Status</label>
            <select id="edit-photo-status" class="form-select">
              <option value="draft" ${photo.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="published" ${photo.status === 'published' ? 'selected' : ''}>Terbit</option>
              <option value="hidden" ${photo.status === 'hidden' ? 'selected' : ''}>Disembunyikan</option>
            </select>
          </div>
          <div class="form-group">
            <label>Latitude</label>
            <input type="number" id="edit-photo-lat" class="form-input" value="${photo.lat}" step="any" />
          </div>
          <div class="form-group">
            <label>Longitude</label>
            <input type="number" id="edit-photo-lon" class="form-input" value="${photo.lon}" step="any" />
          </div>
          <div class="form-group">
            <label>Arah (heading)</label>
            <input type="number" id="edit-photo-heading" class="form-input" value="${photo.headingDeg}" step="any" min="0" max="360" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger" onclick="deletePhotoConfirm(${id})">Hapus</button>
          <button class="btn btn-secondary modal-close">Batal</button>
          <button class="btn btn-primary" onclick="savePhotoEdit(${id})">Simpan</button>
        </div>
      </div>
    `);
  } catch (err) {
    showToast('Gagal memuat foto', err.message, 'error');
  }
};

window.savePhotoEdit = async (id) => {
  const status = $('#edit-photo-status').value;
  const lat = parseFloat($('#edit-photo-lat').value);
  const lon = parseFloat($('#edit-photo-lon').value);
  const headingDeg = parseFloat($('#edit-photo-heading').value);
  
  try {
    await apiFetch(`/api/admin/photos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, lat, lon, headingDeg }),
    });
    closeModal();
    loadPhotos();
    loadStats();
    showToast('Tersimpan!', 'Foto berhasil diperbarui', 'success');
  } catch (err) {
    showToast('Gagal menyimpan', err.message, 'error');
  }
};

window.deletePhotoConfirm = async (id) => {
  if (!confirm(`Hapus foto #${id}? Tindakan ini tidak dapat dibatalkan.`)) return;
  
  try {
    await apiFetch(`/api/admin/photos/${id}`, { method: 'DELETE' });
    closeModal();
    loadPhotos();
    loadStats();
    showToast('Terhapus', 'Foto berhasil dihapus', 'success');
  } catch (err) {
    showToast('Gagal menghapus', err.message, 'error');
  }
};

// =========================================================
// UPLOAD PHOTO MODAL
// =========================================================
$('#btn-upload-photo-quick').addEventListener('click', showUploadPhotoModal);
$('#fab-main').addEventListener('click', showUploadPhotoModal);

function showUploadPhotoModal() {
  showModal(`
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">📷 Upload Foto</h3>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="upload-zone" id="upload-zone">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <p style="font-size:18px;font-weight:500;margin:16px 0 8px">Drag foto kesini</p>
          <p style="font-size:14px;color:var(--gray-600)">atau klik untuk pilih file</p>
          <input type="file" id="upload-photo-input" accept="image/*" style="display:none" multiple />
        </div>
        <div id="upload-preview" class="hidden" style="margin-top:16px">
          <div id="upload-preview-image" style="width:100%;height:240px;background:#000;border-radius:8px;margin-bottom:16px"></div>
          <div id="upload-preview-info" style="font-size:13px;color:var(--gray-600);margin-bottom:16px"></div>
          <div class="form-group">
            <label>Status awal</label>
            <select id="upload-photo-status" class="form-select">
              <option value="published">Terbit langsung</option>
              <option value="draft">Draft (review dulu)</option>
              <option value="hidden">Disembunyikan</option>
            </select>
          </div>
          <details>
            <summary style="cursor:pointer;margin-bottom:8px;color:var(--primary)">⚙️ Pengaturan Lanjutan</summary>
            <div class="form-group">
              <label>Override Latitude (opsional)</label>
              <input type="number" id="upload-photo-lat" class="form-input" step="any" placeholder="Otomatis dari EXIF" />
            </div>
            <div class="form-group">
              <label>Override Longitude (opsional)</label>
              <input type="number" id="upload-photo-lon" class="form-input" step="any" placeholder="Otomatis dari EXIF" />
            </div>
            <div class="form-group">
              <label>Override Heading (opsional)</label>
              <input type="number" id="upload-photo-heading" class="form-input" step="any" min="0" max="360" placeholder="Otomatis dari EXIF" />
            </div>
          </details>
        </div>
        <div id="upload-progress" class="hidden" style="margin-top:16px">
          <div style="background:var(--gray-200);height:8px;border-radius:4px;overflow:hidden">
            <div id="upload-progress-bar" style="height:100%;background:var(--primary);width:0%;transition:width 0.3s"></div>
          </div>
          <p id="upload-progress-text" style="margin-top:8px;font-size:13px;color:var(--gray-600)">Mengunggah...</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Batal</button>
        <button class="btn btn-primary hidden" id="upload-photo-submit">Upload & Terbitkan</button>
      </div>
    </div>
  `);
  
  setupUploadZone();
}

function setupUploadZone() {
  const zone = $('#upload-zone');
  const input = $('#upload-photo-input');
  const preview = $('#upload-preview');
  const submitBtn = $('#upload-photo-submit');
  
  let selectedFile = null;
  
  zone.addEventListener('click', () => input.click());
  
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--primary)';
    zone.style.background = 'var(--primary-light)';
  });
  
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = '';
    zone.style.background = '';
  });
  
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = '';
    zone.style.background = '';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      selectedFile = files[0];
      previewFile(selectedFile);
    }
  });
  
  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      selectedFile = input.files[0];
      previewFile(selectedFile);
    }
  });
  
  submitBtn.addEventListener('click', () => uploadPhotoFile(selectedFile));
}

async function previewFile(file) {
  hide($('#upload-zone'));
  show($('#upload-preview'));
  show($('#upload-photo-submit'));
  
  const previewImg = $('#upload-preview-image');
  const previewInfo = $('#upload-preview-info');
  
  const url = URL.createObjectURL(file);
  previewImg.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain" />`;
  
  // Read dimensions
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const ratio = (w / h).toFixed(2);
    previewInfo.innerHTML = `📐 ${w} × ${h} px · Rasio ${ratio}:1<br>✅ GPS dan heading akan otomatis dibaca dari EXIF`;
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

async function uploadPhotoFile(file) {
  if (!file) return;
  
  hide($('#upload-preview'));
  show($('#upload-progress'));
  $('#upload-photo-submit').disabled = true;
  
  const fd = new FormData();
  fd.append('file', file);
  fd.append('status', $('#upload-photo-status').value);
  
  const lat = $('#upload-photo-lat').value.trim();
  const lon = $('#upload-photo-lon').value.trim();
  const heading = $('#upload-photo-heading').value.trim();
  
  if (lat) fd.append('lat', lat);
  if (lon) fd.append('lon', lon);
  if (heading) fd.append('headingDeg', heading);
  
  try {
    await apiUpload('/api/admin/photos', fd, (percent) => {
      $('#upload-progress-bar').style.width = percent + '%';
      $('#upload-progress-text').textContent = `Mengunggah... ${Math.round(percent)}%`;
    });
    
    closeModal();
    loadPhotos();
    loadStats();
    showToast('Berhasil!', 'Foto berhasil diunggah', 'success');
  } catch (err) {
    hide($('#upload-progress'));
    show($('#upload-preview'));
    $('#upload-photo-submit').disabled = false;
    showToast('Upload gagal', err.message, 'error');
  }
}

// Style upload zone
const uploadZoneStyle = document.createElement('style');
uploadZoneStyle.textContent = `
  .upload-zone {
    border: 2px dashed var(--gray-300);
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
    text-align: center;
    cursor: pointer;
    transition: all var(--transition);
  }
  .upload-zone:hover {
    border-color: var(--primary);
    background: var(--primary-light);
  }
  .upload-zone svg {
    color: var(--gray-400);
    margin-bottom: var(--space-md);
  }
`;
document.head.appendChild(uploadZoneStyle);

// =========================================================
// SEQUENCES (Simplified Table)
// =========================================================
async function loadSequences() {
  const tbody = $('#sequences-tbody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Memuat...</td></tr>';
  
  try {
    const sequences = await apiFetch('/api/admin/sequences');
    if (sequences.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray-600)">Belum ada sequence</td></tr>';
      return;
    }
    
    tbody.innerHTML = sequences.map(s => `
      <tr>
        <td>${s.id}</td>
        <td>${escHtml(s.title)}</td>
        <td>${escHtml(s.camera || '—')}</td>
        <td><span class="status-badge status-${s.status}">${statusLabel(s.status)}</span></td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editSequence(${s.id})">Edit</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">Gagal memuat: ${escHtml(err.message)}</td></tr>`;
  }
}

$('#btn-create-sequence-quick').addEventListener('click', () => {
  showToast('Coming Soon', 'Fitur sequence wizard sedang dikembangkan', 'info');
});

window.editSequence = (id) => {
  showToast('Coming Soon', 'Fitur edit sequence sedang dikembangkan', 'info');
};

// =========================================================
// PLACES
// =========================================================
async function loadPlaces() {
  const tbody = $('#places-tbody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Memuat...</td></tr>';
  
  try {
    const places = await apiFetch('/api/admin/places');
    if (places.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray-600)">Belum ada tempat</td></tr>';
      return;
    }
    
    tbody.innerHTML = places.map(p => `
      <tr>
        <td>${p.id}</td>
        <td>${escHtml(p.name)}</td>
        <td>${escHtml(p.category || '—')}</td>
        <td>${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editPlace(${p.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deletePlace(${p.id})">Hapus</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">Gagal memuat: ${escHtml(err.message)}</td></tr>`;
  }
}

$('#btn-add-place-quick').addEventListener('click', () => {
  showToast('Coming Soon', 'Fitur tambah tempat via modal sedang dikembangkan', 'info');
});

window.editPlace = (id) => {
  showToast('Coming Soon', 'Fitur edit tempat sedang dikembangkan', 'info');
};

window.deletePlace = async (id) => {
  if (!confirm('Hapus tempat ini?')) return;
  try {
    await apiFetch(`/api/admin/places/${id}`, { method: 'DELETE' });
    loadPlaces();
    loadStats();
    showToast('Terhapus', 'Tempat berhasil dihapus', 'success');
  } catch (err) {
    showToast('Gagal menghapus', err.message, 'error');
  }
};

// =========================================================
// REPORTS
// =========================================================
async function loadReports() {
  const tbody = $('#reports-tbody');
  const filter = $('#report-status-filter').value;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="7">Memuat...</td></tr>';
  
  try {
    const url = filter ? `/api/admin/reports?status=${filter}` : '/api/admin/reports';
    const reports = await apiFetch(url);
    
    if (reports.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-600)">Tidak ada laporan</td></tr>';
      return;
    }
    
    const typeLabels = {
      privacy: 'Privasi',
      wrong_location: 'Lokasi Salah',
      other: 'Lainnya'
    };
    
    tbody.innerHTML = reports.map(r => `
      <tr>
        <td>${r.id}</td>
        <td><a href="/api/photos/${r.photo_id}" target="_blank">#${r.photo_id}</a></td>
        <td>${typeLabels[r.type] || r.type}</td>
        <td>${escHtml(r.note || '—')}</td>
        <td>${new Date(r.created_at).toLocaleDateString('id-ID')}</td>
        <td><span class="status-badge status-${r.status}">${r.status === 'open' ? 'Belum ditangani' : 'Selesai'}</span></td>
        <td>
          ${r.status === 'open' ? `<button class="btn btn-sm btn-success" onclick="resolveReport(${r.id})">Selesaikan</button>` : '—'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger)">Gagal memuat: ${escHtml(err.message)}</td></tr>`;
  }
}

$('#report-status-filter').addEventListener('change', loadReports);

window.resolveReport = async (id) => {
  try {
    await apiFetch(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    });
    loadReports();
    loadStats();
    showToast('Selesai', 'Laporan ditandai selesai', 'success');
  } catch (err) {
    showToast('Gagal', err.message, 'error');
  }
};

// =========================================================
// SETTINGS
// =========================================================
async function loadSettings() {
  const tbody = $('#settings-tbody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="6">Memuat...</td></tr>';
  
  try {
    const areas = await apiFetch('/api/admin/map-areas');
    if (areas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-600)">Belum ada pengaturan</td></tr>';
      return;
    }
    
    tbody.innerHTML = areas.map(a => `
      <tr>
        <td>${a.id}</td>
        <td>${escHtml(a.name)}</td>
        <td>${Number(a.center_lat).toFixed(4)}, ${Number(a.center_lon).toFixed(4)}</td>
        <td>${a.zoom}</td>
        <td>${a.is_active ? '<span class="status-badge status-published">Aktif</span>' : '—'}</td>
        <td>
          ${!a.is_active ? `<button class="btn btn-sm btn-success" onclick="activateArea(${a.id})">Aktifkan</button>` : '—'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">Gagal memuat: ${escHtml(err.message)}</td></tr>`;
  }
}

window.activateArea = async (id) => {
  try {
    await apiFetch(`/api/admin/map-areas/${id}/activate`, { method: 'POST' });
    loadSettings();
    showToast('Aktif', 'Area peta diaktifkan', 'success');
  } catch (err) {
    showToast('Gagal', err.message, 'error');
  }
};

// =========================================================
// REFRESH
// =========================================================
$('#btn-refresh').addEventListener('click', () => {
  loadStats();
  const activeTab = $('.tab.active')?.dataset.tab;
  if (activeTab === 'photos') loadPhotos();
  if (activeTab === 'sequences') loadSequences();
  if (activeTab === 'places') loadPlaces();
  if (activeTab === 'reports') loadReports();
  if (activeTab === 'settings') loadSettings();
  showToast('Diperbarui', 'Data berhasil dimuat ulang', 'info');
});

// =========================================================
// BOOT
// =========================================================
(async () => {
  const isAuth = await checkAuth();
  if (isAuth) {
    showDashboard();
  } else {
    showLogin();
  }
})();
