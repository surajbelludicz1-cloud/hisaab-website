/**
 * Hisaab.Guru — Three.js 3D Animations (inspired by ashutilov/three.js-animations)
 * + Interactive Glossy 3D Sprout Mascot Chatbot
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===========================================================================
  // 1. Three.js 3D Wave & Floating Geometry Scene (ashutilov/three.js-animations)
  // ===========================================================================
  function initThreeHeroAnimation() {
    var container = document.getElementById('hg-three-hero-canvas');
    if (!container || typeof THREE === 'undefined' || reduceMotion) return;

    var width = container.clientWidth || 600;
    var height = container.clientHeight || 480;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 6, 26);

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch (e) {
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting for glossy 3D shapes
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    var dirLight1 = new THREE.DirectionalLight(0x9eff5a, 1.2);
    dirLight1.position.set(12, 18, 15);
    scene.add(dirLight1);

    var dirLight2 = new THREE.PointLight(0xffd54f, 0.9, 60);
    dirLight2.position.set(-12, -8, 12);
    scene.add(dirLight2);

    // A) ashutilov/three.js-animations Wave Particle Plane
    var cols = 26;
    var rows = 18;
    var particleCount = cols * rows;
    var positions = new Float32Array(particleCount * 3);
    var colors = new Float32Array(particleCount * 3);

    var idx = 0;
    for (var ix = 0; ix < cols; ix++) {
      for (var iy = 0; iy < rows; iy++) {
        positions[idx * 3] = (ix - cols / 2) * 1.35;
        positions[idx * 3 + 1] = -5.5;
        positions[idx * 3 + 2] = (iy - rows / 2) * 1.35;

        var isGold = (ix + iy) % 5 === 0;
        colors[idx * 3] = isGold ? 1.0 : 0.36;
        colors[idx * 3 + 1] = isGold ? 0.84 : 0.92;
        colors[idx * 3 + 2] = isGold ? 0.31 : 0.32;
        idx++;
      }
    }

    var waveGeo = new THREE.BufferGeometry();
    waveGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    waveGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var waveMat = new THREE.PointsMaterial({
      size: 0.34,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
    });
    var wavePoints = new THREE.Points(waveGeo, waveMat);
    scene.add(wavePoints);

    // B) Floating Glossy 3D Emerald & Gold Geometric Orbs / Rings around the Mascot
    var floatGroup = new THREE.Group();
    scene.add(floatGroup);

    var emeraldMat = new THREE.MeshPhysicalMaterial({
      color: 0x3bd63f,
      roughness: 0.18,
      metalness: 0.1,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
    });
    var goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd54f,
      roughness: 0.22,
      metalness: 0.65,
    });

    var torus = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.38, 20, 48), goldMat);
    torus.position.set(-8.5, 4.2, -2);
    floatGroup.add(torus);

    var icosa = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 0), emeraldMat);
    icosa.position.set(8.8, 4.8, -1);
    floatGroup.add(icosa);

    var octa = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), goldMat);
    octa.position.set(7.6, -2.5, 1);
    floatGroup.add(octa);

    var sphere = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 28), emeraldMat);
    sphere.position.set(-7.8, -2.2, 1.5);
    floatGroup.add(sphere);

    var mouseX = 0;
    var mouseY = 0;
    window.addEventListener('pointermove', function (e) {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    var clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      var elapsed = clock.getElapsedTime();

      // Update wave vertices
      var posArr = waveGeo.attributes.position.array;
      var k = 0;
      for (var ix = 0; ix < cols; ix++) {
        for (var iy = 0; iy < rows; iy++) {
          posArr[k * 3 + 1] =
            -5.2 +
            Math.sin((ix + elapsed * 2.2) * 0.45) * 1.1 +
            Math.cos((iy + elapsed * 1.8) * 0.45) * 0.9;
          k++;
        }
      }
      waveGeo.attributes.position.needsUpdate = true;

      // Rotate floating 3D shapes
      torus.rotation.x = elapsed * 0.8;
      torus.rotation.y = elapsed * 1.1;
      torus.position.y = 4.2 + Math.sin(elapsed * 2.0) * 0.7;

      icosa.rotation.x = -elapsed * 0.7;
      icosa.rotation.z = elapsed * 0.9;
      icosa.position.y = 4.8 + Math.cos(elapsed * 2.3) * 0.8;

      octa.rotation.y = elapsed * 1.2;
      octa.position.y = -2.5 + Math.sin(elapsed * 2.6 + 1) * 0.6;

      sphere.position.y = -2.2 + Math.cos(elapsed * 2.1 + 2) * 0.65;

      // Subtle camera parallax
      camera.position.x += (mouseX * 2.4 - camera.position.x) * 0.05;
      camera.position.y += (6 - mouseY * 1.6 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', function () {
      var nw = container.clientWidth || 600;
      var nh = container.clientHeight || 480;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
  }

  // ===========================================================================
  // 2. Interactive Mascot Chatbot on Screen (Works on Landing & GST Pages)
  // ===========================================================================
  var MASCOT_REPLIES = {
    scan: '📸 Bas bill ki photo kheench! Point your phone camera at any supplier invoice or café receipt — I auto-extract items, HSN, CGST & SGST in 0.4 seconds and categorize expenses automatically!',
    profit: '📊 Profit Samjho! Every sale and purchase bill updates your live P&L, Trial Balance, and GST Input Tax Credit (ITC) in real time so you know your exact monthly profit at a glance.',
    gst: '🧾 Tumhare business ka Personal Hisaab.Guru! Complete all mandatory fields & 4 Document Vault slots on Screen 1, get Rule 14A 3-day fast-track GSTIN & Rule 10A 30-day bank deferral.',
    ca: '😎 Next time your CA calls saying “Sir, bills bhejo!”, just tap Export GST Ledger — all your B2B/B2C invoices, HSN summaries, and GSTR-1 / 3B records are ready in one place!',
  };

  function appendMascotBubble(container, text, isUser) {
    if (!container) return;
    var row = document.createElement('div');
    row.className = isUser ? 'flex justify-end' : 'flex items-start gap-2.5';
    if (isUser) {
      row.innerHTML =
        '<div class="rounded-2xl rounded-tr-sm bg-[#16A34A] text-white px-3.5 py-2 text-xs font-medium max-w-[82%] shadow-sm">' +
        text.replace(/</g, '&lt;') +
        '</div>';
    } else {
      row.innerHTML =
        '<img src="/assets/hisaab-mark.svg" alt="Hisaab.Guru Mascot" class="w-7 h-7 shrink-0 mt-0.5 drop-shadow" />' +
        '<div class="rounded-2xl rounded-tl-sm bg-[var(--il-panel)] border border-[var(--il-line-strong)] px-3.5 py-2.5 text-xs text-[var(--il-ink)] leading-relaxed max-w-[85%] shadow-sm">' +
        text +
        '</div>';
    }
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  window.toggleMascotChatbot = function (forceOpen) {
    var win = document.getElementById('hgMascotChatWindow');
    if (!win) return;
    var isOpen = win.classList.contains('is-open');
    var nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;
    win.classList.toggle('is-open', nextOpen);
    win.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
    if (nextOpen) {
      var inp = document.getElementById('hgMascotChatInput');
      if (inp) setTimeout(function () { inp.focus(); }, 80);
    }
  };

  window.sendMascotQuickPrompt = function (promptText) {
    var list = document.getElementById('hgMascotChatMessages');
    if (!list) return;
    appendMascotBubble(list, promptText, true);
    var lower = String(promptText || '').toLowerCase();
    var reply = MASCOT_REPLIES.scan;
    if (lower.indexOf('gst') !== -1 || lower.indexOf('bank') !== -1) {
      reply = MASCOT_REPLIES.gst;
    } else if (lower.indexOf('profit') !== -1) {
      reply = MASCOT_REPLIES.profit;
    } else if (lower.indexOf('reel') !== -1 || lower.indexOf('video') !== -1) {
      reply = '🎬 Opening the 30-second 3D Animated Movie with loud spoken Hinglish voiceover & music right now!';
      var modal = document.getElementById('reel_video_modal');
      var v = document.getElementById('heroReelModalVideo');
      if (modal && typeof modal.showModal === 'function') {
        modal.showModal();
        if (v) { v.muted = false; v.volume = 1.0; v.currentTime = 0; v.play(); }
      }
    }
    setTimeout(function () {
      appendMascotBubble(list, reply, false);
    }, 180);
  };

  window.submitMascotChatForm = function (e) {
    if (e) e.preventDefault();
    var inp = document.getElementById('hgMascotChatInput');
    var list = document.getElementById('hgMascotChatMessages');
    if (!inp || !list) return;
    var q = inp.value.trim();
    if (!q) return;
    inp.value = '';
    appendMascotBubble(list, q, true);

    fetch('/api/gst-registration/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var ans = (data && data.answer) ? data.answer : MASCOT_REPLIES.scan;
        appendMascotBubble(list, ans, false);
      })
      .catch(function () {
        appendMascotBubble(list, MASCOT_REPLIES.scan, false);
      });
  };

  window.addEventListener('DOMContentLoaded', function () {
    initThreeHeroAnimation();
  });
})();
