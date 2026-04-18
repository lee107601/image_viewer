const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCo1Md6ZQiBdMA1NxqLF10wV7jNUY-wl1Q",
  authDomain: "imageviewer-7e92a.firebaseapp.com",
  projectId: "imageviewer-7e92a",
  storageBucket: "imageviewer-7e92a.firebasestorage.app",
  messagingSenderId: "409270087263",
  appId: "1:409270087263:web:3f9e1b317d1c05930775ea",
  measurementId: "G-5WK75MTMSE"
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔧 Cloudinary 설정 (본인 값으로 교체)
   cloudinary.com → Settings → Upload → Upload presets
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const CLOUDINARY_CLOUD  = 'dyvndewhe';
const CLOUDINARY_PRESET = 'imageviewer';
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

/* ── DOM ── */
const gallery      = document.getElementById('gallery');
const toolbar      = document.getElementById('toolbar');
const statusEl     = document.getElementById('status');
const countEl      = document.getElementById('count');
const headerCnt    = document.getElementById('header-count');
const lightbox     = document.getElementById('lightbox');
const lbImg        = document.getElementById('lb-img');
const lbTitle      = document.getElementById('lb-title');
const lbCounter    = document.getElementById('lb-counter');
const lbComments   = document.getElementById('lb-comments');
const lbName       = document.getElementById('lb-name');
const lbMsg        = document.getElementById('lb-msg');
const lbSend       = document.getElementById('lb-send');
const lbVideo      = document.getElementById('lb-video');
const uploadModal  = document.getElementById('upload-modal');
const uploadInput  = document.getElementById('upload-input');
const uploadProgress = document.getElementById('upload-progress');
const uploadBar    = document.getElementById('upload-bar');
const uploadStatus = document.getElementById('upload-status');

let staticPhotos   = [];   // photos.json 기반
let uploadedPhotos = [];   // Firestore uploads 컬렉션
let photos         = [];   // 병합된 최종 목록
let lbIndex        = 0;
let unsubFn        = null;

/* ── 초기화 ── */
async function init() {
  // 정적 사진 로드
  try {
    const res = await fetch('photos.json');
    if (res.ok) {
      const list = await res.json();
      staticPhotos = list.map(name => ({
        src: 'photos/' + name, thumb: 'thumbs/' + name, name, type: 'static'
      }));
    }
  } catch { /* photos.json 없어도 계속 진행 */ }

  // 업로드된 사진 실시간 구독
  db.collection('uploads').orderBy('ts', 'desc').onSnapshot(snap => {
    uploadedPhotos = snap.docs.map(doc => {
      const d = doc.data();
      return { src: d.src, thumb: d.thumb, name: d.name, type: 'upload', id: doc.id };
    });
    mergeAndRender();
  });

  statusEl.classList.add('hidden');
}

function mergeAndRender() {
  photos = [...uploadedPhotos, ...staticPhotos];
  renderGallery();
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
      <img src="${img.thumb}" alt="${esc(img.name)}" loading="lazy" />
      <div class="card-overlay"><div class="card-name">${esc(img.name)}</div></div>
      <div class="card-badge" id="badge-${i}">💬 <span>0</span></div>
      ${img.mediaType === 'video' ? '<div class="card-play">▶</div>' : ''}`;
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
      badge.querySelector('span').textContent = snap.size;
      badge.classList.toggle('visible', snap.size > 0);
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

/* ── 업로드 ── */
function compressImage(file, maxPx, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`이미지 로드 실패: ${file.name}`)); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else        { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('이미지 압축 실패'));
      }, 'image/jpeg', quality);
    };
    img.src = url;
  });
}

function cloudinaryThumb(url) {
  return url.replace('/upload/', '/upload/w_600,c_limit,q_80,f_auto/');
}

function cloudinaryVideoThumb(url) {
  return url
    .replace('/video/upload/', '/video/upload/w_600,c_limit,q_80,f_auto,so_0/')
    .replace(/\.[^.]+$/, '.jpg');
}

function uploadToCloudinary(file, resourceType = 'image') {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) setBar(Math.round(e.loaded / e.total * 100));
    };
    xhr.onload = () => {
      const res = JSON.parse(xhr.responseText);
      if (xhr.status === 200) resolve(res.secure_url);
      else reject(new Error(res.error?.message || '업로드 실패'));
    };
    xhr.onerror = () => reject(new Error('네트워크 오류'));
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`);
    xhr.send(form);
  });
}

document.getElementById('fab').addEventListener('click', () => {
  uploadInput.click();
});

uploadInput.addEventListener('change', async e => {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  uploadInput.value = '';

  uploadModal.classList.add('open');
  uploadProgress.style.display = 'block';

  let successCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isVideo = file.type.startsWith('video/');
    setBar(0);

    try {
      let srcUrl, thumbUrl;

      if (isVideo) {
        if (file.size > 200 * 1024 * 1024) {
          uploadStatus.textContent = `⚠ 동영상이 너무 큽니다 (최대 200MB): ${file.name}`;
          await delay(2500);
          continue;
        }
        uploadStatus.textContent = `(${i + 1}/${files.length}) 동영상 업로드 중... ${file.name}`;
        srcUrl   = await uploadToCloudinary(file, 'video');
        thumbUrl = cloudinaryVideoThumb(srcUrl);
      } else {
        uploadStatus.textContent = `(${i + 1}/${files.length}) 압축 중... ${file.name}`;
        const blob = await compressImage(file, 1800);
        uploadStatus.textContent = `(${i + 1}/${files.length}) 업로드 중...`;
        srcUrl   = await uploadToCloudinary(blob, 'image');
        thumbUrl = cloudinaryThumb(srcUrl);
      }

      await db.collection('uploads').add({
        src: srcUrl, thumb: thumbUrl,
        name: file.name,
        mediaType: isVideo ? 'video' : 'image',
        ts: firebase.firestore.FieldValue.serverTimestamp()
      });

      successCount++;
      setBar(100);

    } catch (err) {
      console.error('업로드 실패:', err);
      uploadStatus.textContent = `⚠ 오류: ${err.message}`;
      await delay(3000);
    }
  }

  if (successCount > 0) {
    uploadStatus.textContent = `완료! ${successCount}장 업로드됨 🐾`;
    await delay(1200);
    closeUploadModal();
  }
});

function setBar(pct) {
  uploadBar.style.width = pct + '%';
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function closeUploadModal() {
  uploadModal.classList.remove('open');
  uploadProgress.style.display = 'none';
  uploadBar.style.width = '0%';
  uploadStatus.textContent = '';
}

document.getElementById('upload-cancel').addEventListener('click', closeUploadModal);

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
  lbVideo.pause();
  lbVideo.src = '';
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
}

function showLb() {
  const img = photos[lbIndex];
  lbTitle.textContent   = img.name;
  lbCounter.textContent = `${lbIndex + 1} / ${photos.length}`;
  lbMsg.value = '';
  document.getElementById('lb-delete').classList.toggle('hidden', img.type !== 'upload');

  const isVideo = img.mediaType === 'video';
  lbImg.classList.toggle('hidden', isVideo);
  lbVideo.classList.toggle('hidden', !isVideo);

  if (isVideo) {
    lbVideo.src = img.src;
    lbVideo.poster = img.thumb;
  } else {
    lbImg.src = img.thumb;
    lbImg.style.filter = 'blur(4px)';
    const full = new Image();
    full.onload = () => { lbImg.src = img.src; lbImg.style.filter = ''; };
    full.src = img.src;
  }

  subscribeComments(img.name);
}

function subscribeComments(photoName) {
  if (unsubFn) { unsubFn(); unsubFn = null; }
  lbComments.innerHTML = '<div class="comment-loading"><div class="spinner"></div></div>';

  unsubFn = db.collection('photos').doc(encodeKey(photoName))
    .collection('comments').orderBy('ts', 'asc')
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
function prevPhoto() { lbVideo.pause(); lbIndex = (lbIndex - 1 + photos.length) % photos.length; showLb(); }
function nextPhoto() { lbVideo.pause(); lbIndex = (lbIndex + 1) % photos.length; showLb(); }

async function deletePhoto() {
  const img = photos[lbIndex];
  if (img.type !== 'upload') return;
  if (!confirm(`"${img.name}" 사진을 삭제할까요?`)) return;
  try {
    await db.collection('uploads').doc(img.id).delete();
    closeLightbox();
  } catch (err) {
    alert('삭제 실패: ' + err.message);
  }
}

document.getElementById('lb-prev').onclick   = prevPhoto;
document.getElementById('lb-next').onclick   = nextPhoto;
document.getElementById('lb-close').onclick  = closeLightbox;
document.getElementById('lb-delete').onclick = deletePhoto;

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
