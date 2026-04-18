const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCo1Md6ZQiBdMA1NxqLF10wV7jNUY-wl1Q",
  authDomain: "imageviewer-7e92a.firebaseapp.com",
  projectId: "imageviewer-7e92a",
  storageBucket: "imageviewer-7e92a.firebasestorage.app",
  messagingSenderId: "409270087263",
  appId: "1:409270087263:web:3f9e1b317d1c05930775ea",
  measurementId: "G-5WK75MTMSE"
};

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

/* ── DOM ── */
const gallery    = document.getElementById('gallery');
const toolbar    = document.getElementById('toolbar');
const statusEl   = document.getElementById('status');
const countEl    = document.getElementById('count');
const headerCnt  = document.getElementById('header-count');
const lightbox   = document.getElementById('lightbox');
const lbImg      = document.getElementById('lb-img');
const lbTitle    = document.getElementById('lb-title');
const lbCounter  = document.getElementById('lb-counter');
const lbComments = document.getElementById('lb-comments');
const lbName     = document.getElementById('lb-name');
const lbMsg      = document.getElementById('lb-msg');
const lbSend     = document.getElementById('lb-send');

let photos  = [];
let lbIndex = 0;
let unsubFn = null;

/* ── 사진 로드 ── */
async function init() {
  try {
    const res = await fetch('photos.json');
    if (!res.ok) throw new Error();
    const list = await res.json();
    photos = list.map(name => ({ src: 'photos/' + name, thumb: 'thumbs/' + name, name }));
    statusEl.classList.add('hidden');
    renderGallery();
  } catch {
    statusEl.innerHTML = '<p style="color:#f76aa8">⚠ photos.json 파일이 없습니다.<br><small>make.bat 을 실행해 사진 목록을 생성하세요.</small></p>';
  }
}

function renderGallery() {
  const sort   = document.getElementById('sort-select').value;
  const sorted = [...photos];
  if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));

  gallery.innerHTML = '';
  sorted.forEach((img, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${img.thumb}" alt="${img.name}" loading="lazy" />
      <div class="card-overlay"><div class="card-name">${img.name}</div></div>
      <div class="card-badge" id="badge-${i}">💬 <span>0</span></div>`;
    card.querySelector('img').onload = e => e.target.classList.add('loaded');
    card.addEventListener('click', () => openLightbox(i));
    gallery.appendChild(card);
    loadBadge(img.name, i);
  });

  const n = photos.length;
  countEl.textContent   = `사진 ${n}장`;
  headerCnt.textContent = `사진 ${n}장`;
  toolbar.classList.toggle('visible', n > 0);
}

function loadBadge(name, i) {
  db.collection('photos').doc(encodeKey(name)).collection('comments')
    .onSnapshot(snap => {
      const badge = document.getElementById('badge-' + i);
      if (!badge) return;
      if (snap.size > 0) {
        badge.querySelector('span').textContent = snap.size;
        badge.classList.add('visible');
      } else {
        badge.classList.remove('visible');
      }
    });
}

document.getElementById('sort-select').addEventListener('change', renderGallery);
document.querySelectorAll('.cols-btn button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cols-btn button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gallery.className = 'cols-' + btn.dataset.cols;
  });
});

/* ── 키 인코딩 ── */
function encodeKey(name) {
  return name.replace(/\//g, '__');
}

/* ── 라이트박스 ── */
function openLightbox(i) {
  lbIndex = i;
  showLb();
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
  lbName.value = localStorage.getItem('lb-name') || '';
}

function closeLightbox() {
  if (unsubFn) { unsubFn(); unsubFn = null; }
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
}

function showLb() {
  const img = photos[lbIndex];
  lbTitle.textContent   = img.name;
  lbCounter.textContent = `${lbIndex + 1} / ${photos.length}`;
  lbMsg.value = '';

  lbImg.src = img.thumb;
  lbImg.style.filter = 'blur(4px)';
  const full = new Image();
  full.onload = () => { lbImg.src = img.src; lbImg.style.filter = ''; };
  full.src = img.src;

  subscribeComments(img.name);
}

function subscribeComments(photoName) {
  if (unsubFn) { unsubFn(); unsubFn = null; }
  lbComments.innerHTML = '<div class="comment-loading"><div class="spinner"></div></div>';

  unsubFn = db.collection('photos').doc(encodeKey(photoName))
    .collection('comments')
    .orderBy('ts', 'asc')
    .onSnapshot(snap => {
      if (snap.empty) {
        lbComments.innerHTML = '<p class="comment-empty">아직 메시지가 없어요.<br>첫 메시지를 남겨보세요 🐾</p>';
        return;
      }
      lbComments.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const el = document.createElement('div');
        el.className = 'comment-item';
        el.innerHTML = `
          <div class="comment-avatar">${(d.name || '?')[0].toUpperCase()}</div>
          <div class="comment-body">
            <div class="comment-name">${esc(d.name)}</div>
            <div class="comment-text">${esc(d.text)}</div>
            <div class="comment-time">${timeAgo(d.ts?.toDate())}</div>
          </div>`;
        lbComments.appendChild(el);
      });
      lbComments.scrollTop = lbComments.scrollHeight;
    });
}

/* ── 댓글 전송 ── */
async function sendComment() {
  const name = lbName.value.trim();
  const text = lbMsg.value.trim();
  if (!name) { lbName.focus(); return; }
  if (!text) { lbMsg.focus(); return; }

  lbSend.disabled = true;
  localStorage.setItem('lb-name', name);

  try {
    await db.collection('photos').doc(encodeKey(photos[lbIndex].name))
      .collection('comments').add({ name, text, ts: firebase.firestore.FieldValue.serverTimestamp() });
    lbMsg.value = '';
  } catch {
    alert('전송 실패: Firebase 설정을 확인하세요.');
  } finally {
    lbSend.disabled = false;
    lbMsg.focus();
  }
}

lbSend.addEventListener('click', sendComment);
lbMsg.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendComment(); });

/* ── 네비게이션 ── */
function prevPhoto() { lbIndex = (lbIndex - 1 + photos.length) % photos.length; showLb(); }
function nextPhoto() { lbIndex = (lbIndex + 1) % photos.length; showLb(); }

document.getElementById('lb-prev').onclick  = prevPhoto;
document.getElementById('lb-next').onclick  = nextPhoto;
document.getElementById('lb-close').onclick = closeLightbox;

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'ArrowLeft')  prevPhoto();
  if (e.key === 'ArrowRight') nextPhoto();
  if (e.key === 'Escape')     closeLightbox();
});

const imgWrap = document.getElementById('lb-image-wrap');
let tsX = 0;
imgWrap.addEventListener('touchstart', e => { tsX = e.touches[0].clientX; }, { passive: true });
imgWrap.addEventListener('touchend',   e => {
  const dx = e.changedTouches[0].clientX - tsX;
  if (Math.abs(dx) < 40) return;
  dx < 0 ? nextPhoto() : prevPhoto();
});

/* ── 유틸 ── */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeAgo(date) {
  if (!date) return '';
  const sec = Math.floor((Date.now() - date) / 1000);
  if (sec < 60)    return '방금 전';
  if (sec < 3600)  return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return date.toLocaleDateString('ko-KR');
}

init();
