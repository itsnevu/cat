# SPHYNX: Meja Riset AI yang Bekerja 24 Jam, tapi Tidak Pernah Trading Tanpa Izin Anda

Pasar saham kini tidak pernah tutup. Dengan saham tertokenisasi di Robinhood Chain, jual beli bisa terjadi kapan saja, dan satu swap hanya butuh satu klik. Masalahnya, manusia tetap butuh tidur. SPHYNX lahir dari celah itu: sebuah meja riset AI yang meneliti pasar sepanjang waktu, tetapi berhenti tepat sebelum tombol "beli" ditekan, karena keputusan terakhir selalu ada di tangan Anda.

## Bukan bot, tapi tim analis

Kebanyakan "trading bot" adalah satu prompt besar yang diberi akses penuh ke akun. SPHYNX mengambil pendekatan yang berbeda. Ia berjalan di dalam Claude Code dan bekerja seperti meja institusi kecil dengan pembagian peran yang jelas:

- **Portfolio Manager** adalah sesi utama Claude Code yang Anda ajak bicara. Ia satu-satunya peran yang memegang alat order.
- **Tiga analis spesialis** (Fundamental, Teknikal, dan Makro/Berita) menyaring watchlist dan meneliti setiap kandidat secara paralel. Ketiganya hanya punya akses baca.
- **Risk Manager** yang independen memeriksa setiap usulan dan berhak memberi tiga putusan: APPROVE, APPROVE-WITH-CHANGES, atau VETO. Veto menghentikan proses seketika.

Setiap peran hanyalah file Markdown di folder `.claude/agents/`. Daftar alat yang boleh dipakai masing-masing peran tertulis di frontmatter file itu, sehingga siapa pun bisa membukanya dan memverifikasi sendiri bahwa para analis memang tidak memegang alat order.

## Satu putaran desk, dari sense sampai snapshot

Sebuah permintaan mengalir melalui sepuluh langkah: Sense, Screen, Research, Synthesize, Risk, Preview, Approval, Execute, Confirm, dan Snapshot. Enam langkah pertama murni riset dan tidak pernah menghasilkan order. Hasilnya adalah sebuah **kartu preview**: satu usulan trade yang terikat pada aturan tertulis di folder `strategies/`, lengkap dengan alasan dan putusan Risk Manager.

Di titik itu desk berhenti dan menunggu. Order baru dikirim ke Robinhood setelah Anda mengatakan "ya", dan bahkan setelah itu masih ada gerbang izin `deny → ask → allow` di pengaturan Claude Code yang meminta konfirmasi sekali lagi. Tombol daruratnya satu perintah: mencabut koneksi MCP ke Robinhood.

## Arsitektur yang sengaja dibuat kecil

Tidak ada backend server, tidak ada orkestrator Python, tidak ada database, tidak ada Docker. Koneksi ke broker hanya lewat satu server MCP milik Robinhood Agentic dengan autentikasi OAuth di dalam sesi. State disimpan sebagai satu file snapshot JSON ditambah log JSONL yang hanya bisa ditambah, bukan diubah. Dashboard berbasis Vite dan React hanya membaca snapshot itu dan tidak bisa mengirim order.

Pilihan ini bukan sekadar soal kesederhanaan. Semakin sedikit komponen, semakin sedikit tempat bagi kesalahan atau serangan untuk bersembunyi. Analis berita, misalnya, diisolasi khusus terhadap prompt injection, karena artikel di internet adalah pintu masuk paling mudah bagi instruksi berbahaya.

## Dari aturan tertulis menjadi kode di on-chain

Di sisi lain SPHYNX ada modul terpisah yang sudah dideploy ke Robinhood Chain mainnet (chainId 4663). Jika di desk aturan risiko "dibaca" oleh agen, di on-chain aturan itu "dipaksakan" oleh kontrak. Ada tiga lapisan:

1. **SessionKeyExecutor**: agen tidak pernah memegang hot wallet permanen. Ia trading lewat kunci sesi yang kedaluwarsa, dibatasi ukuran per trade, total anggaran, jumlah trade, dan daftar ticker yang diizinkan.
2. **RWAVault dan GuardrailConfig**: vault ERC-4626 di atas USDG yang menolak setiap order yang melanggar batas risiko. Fungsi `previewTrade()` memberi tahu aturan mana yang akan dilanggar sebelum ada yang menandatangani.
3. **DeskRegistry**: catatan attestasi yang hanya bisa ditambah. Penolakan dan veto tercatat permanen dan tidak bisa dihapus.

Tidak ada biaya manajemen, biaya performa, atau carry di dalam kontrak. Kepemilikan seluruh stack ada pada Safe multisig 2-dari-3.

## Jujur soal batasan

Yang membedakan SPHYNX dari proyek serupa adalah keterbukaannya tentang apa yang belum ada. Kontraknya belum diaudit pihak ketiga. Deposit dibatasi 10.000 USDG, TVL masih nol, belum ada trader, belum ada rekam jejak, dan belum ada timelock untuk perubahan parameter. Token $SPHYNX tidak dibangun. Modul on-chain juga tidak terhubung ke jalur trading desk; setiap order saham tetap melewati Robinhood dan persetujuan Anda.

Metrik pertama yang ingin dipublikasikan tim bukan return, melainkan seberapa sering vault berkata "tidak". Di TVL nol, itulah satu-satunya angka yang bisa dikumpulkan dengan jujur.

## Untuk siapa SPHYNX

SPHYNX cocok bagi trader yang ingin riset sistematis dan berlapis tanpa menyerahkan kendali akun kepada mesin. Akses saat ini berbasis permintaan, melibatkan uang sungguhan, dan bukan nasihat investasi. Dokumentasi lengkap, mulai dari quickstart hingga arsitektur on-chain, tersedia di sphynxagent.xyz/docs.

Pasar memang tidak pernah tutup lagi. Dengan SPHYNX, penjaga gerbangnya juga tidak.
