export const i18n = {
  // Map UI
  appTitle: 'Street View Takengon',
  clickHint: 'Klik garis biru untuk memilih lokasi',
  openStreetView: 'Lihat Street View',
  streetViewLabel: 'Street View',

  // Viewer UI
  backToMap: 'Kembali ke peta',
  forward: 'Maju',
  backward: 'Mundur',
  turnLeft: 'Putar kiri',
  turnRight: 'Putar kanan',
  report: 'Laporkan',
  locationInfo: 'Info lokasi',

  // Card
  noPhotoSelected: 'Klik garis biru untuk memilih lokasi',
  nearLabel: 'Dekat',
  coordinatesLabel: 'Koordinat',

  // Report modal
  reportTitle: 'Laporkan Masalah',
  reportType: 'Jenis masalah',
  reportTypePrivacy: 'Privasi (wajah/plat terlihat)',
  reportTypeWrongLocation: 'Lokasi salah',
  reportTypeOther: 'Lainnya',
  reportNote: 'Catatan (opsional)',
  reportSubmit: 'Kirim laporan',
  reportCancel: 'Batal',
  reportSuccess: 'Laporan berhasil dikirim',
  reportError: 'Gagal mengirim laporan',

  // Navigation
  neighbor: 'Foto tetangga',
  noNeighbors: 'Tidak ada foto tetangga',

  // Loading states
  loading: 'Memuat...',
  loadingPhoto: 'Memuat foto...',
  loadingMap: 'Memuat peta...',
  errorLoading: 'Gagal memuat',

  // Attribution
  mapAttribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',

  // Accessibility
  ariaMapContainer: 'Peta jalan Takengon',
  ariaStreetViewCard: 'Kartu pratinjau Street View',
  ariaOpenViewer: 'Buka penampil Street View',
  ariaCloseViewer: 'Tutup penampil Street View',
  ariaNavigationArrow: 'Panah navigasi ke foto berikutnya',
  ariaMinimap: 'Peta mini posisi saat ini',
} as const;

export type I18nKey = keyof typeof i18n;
