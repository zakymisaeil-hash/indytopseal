(function () {
  const canvasEl = document.getElementById('canvas');
  const canvasWrap = document.getElementById('canvas-wrap');
  const emptyState = document.getElementById('empty-state');
  const statusText = document.getElementById('status-text');
  const statusSize = document.getElementById('status-size');
  const zoomLabel = document.getElementById('zoom-label');

  const canvas = new fabric.Canvas('canvas', {
    backgroundColor: '#111',
    preserveObjectStacking: true
  });

  let baseImage = null;
  let currentFilePath = null;
  let currentTool = 'select';
  let zoom = 1;
  let cropRect = null;
  let isDrawingShape = false;
  let shapeStart = null;
  let activeShape = null;

  // ---------- History (undo/redo) ----------
  const history = [];
  let historyIndex = -1;
  let restoring = false;

  function snapshot() {
    if (restoring) return;
    const json = JSON.stringify(canvas.toJSON(['selectable', 'evented', 'isBase']));
    history.splice(historyIndex + 1);
    history.push(json);
    historyIndex = history.length - 1;
  }

  function restoreFrom(index) {
    if (index < 0 || index >= history.length) return;
    restoring = true;
    canvas.loadFromJSON(history[index], () => {
      canvas.getObjects().forEach((o) => {
        if (o.isBase) baseImage = o;
      });
      canvas.renderAll();
      restoring = false;
      updateEmptyState();
    });
    historyIndex = index;
  }

  function undo() {
    if (historyIndex > 0) restoreFrom(historyIndex - 1);
  }
  function redo() {
    if (historyIndex < history.length - 1) restoreFrom(historyIndex + 1);
  }

  canvas.on('object:modified', snapshot);
  canvas.on('object:added', (e) => {
    if (!restoring) snapshot();
  });
  canvas.on('object:removed', () => { if (!restoring) snapshot(); });

  // ---------- Canvas sizing / zoom ----------
  function fitCanvasToWrap() {
    const w = canvasWrap.clientWidth - 40;
    const h = canvasWrap.clientHeight - 40;
    if (!baseImage) return;
    const scale = Math.min(w / baseImage.width, h / baseImage.height, 1);
    setZoom(scale > 0 ? scale : 1);
  }

  function setZoom(z) {
    zoom = Math.max(0.1, Math.min(5, z));
    canvas.setZoom(zoom);
    if (baseImage) {
      canvas.setWidth(baseImage.width * zoom);
      canvas.setHeight(baseImage.height * zoom);
    }
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }

  document.getElementById('btn-zoom-in').onclick = () => setZoom(zoom + 0.1);
  document.getElementById('btn-zoom-out').onclick = () => setZoom(zoom - 0.1);

  function updateEmptyState() {
    emptyState.style.display = baseImage ? 'none' : 'block';
    canvasEl.style.display = baseImage ? 'block' : 'none';
    if (baseImage) {
      statusSize.textContent = `${Math.round(baseImage.width)} x ${Math.round(baseImage.height)} px`;
    } else {
      statusSize.textContent = '';
    }
  }

  // ---------- Loading images ----------
  async function loadImageFromDataUrl(dataUrl, filePath) {
    return new Promise((resolve) => {
      fabric.Image.fromURL(dataUrl, (img) => {
        canvas.clear();
        history.length = 0;
        historyIndex = -1;

        img.set({
          left: 0,
          top: 0,
          selectable: false,
          evented: false,
          isBase: true
        });
        img.filters = [];
        baseImage = img;
        currentFilePath = filePath || null;

        canvas.add(img);
        canvas.setDimensions({ width: img.width, height: img.height });
        canvas.renderAll();
        fitCanvasToWrap();
        updateEmptyState();
        resetAdjustmentUI();
        snapshot();
        setStatus(filePath ? `Loaded ${filePath}` : 'Image loaded');
        resolve(img);
      }, { crossOrigin: 'anonymous' });
    });
  }

  async function openImage() {
    const result = await window.api.openImage();
    if (!result) return;
    await loadImageFromDataUrl(result.dataUrl, result.filePath);
  }

  async function saveImage(forceDialog) {
    if (!baseImage) return;
    canvas.discardActiveObject();
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 / zoom });
    const saved = await window.api.saveImage({
      dataUrl,
      defaultPath: forceDialog ? undefined : currentFilePath || 'edited-image.png'
    });
    if (saved) {
      currentFilePath = saved;
      setStatus(`Saved to ${saved}`);
    }
  }

  function setStatus(msg) {
    statusText.textContent = msg;
  }

  document.getElementById('btn-open').onclick = openImage;
  document.getElementById('btn-open-2').onclick = openImage;
  document.getElementById('btn-save').onclick = () => saveImage(false);
  document.getElementById('btn-undo').onclick = undo;
  document.getElementById('btn-redo').onclick = redo;
  document.getElementById('btn-delete').onclick = () => {
    const active = canvas.getActiveObjects();
    active.forEach((o) => { if (!o.isBase) canvas.remove(o); });
    canvas.discardActiveObject();
    canvas.renderAll();
  };

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement === document.body) {
      document.getElementById('btn-delete').click();
    }
  });

  window.api.onMenu('menu:open', openImage);
  window.api.onMenu('menu:save', () => saveImage(false));
  window.api.onMenu('menu:save-as', () => saveImage(true));
  window.api.onMenu('menu:undo', undo);
  window.api.onMenu('menu:redo', redo);

  // ---------- Rotate / Flip ----------
  document.getElementById('btn-rotate-l').onclick = () => rotateImage(-90);
  document.getElementById('btn-rotate-r').onclick = () => rotateImage(90);
  document.getElementById('btn-flip-h').onclick = () => {
    if (!baseImage) return;
    baseImage.set('flipX', !baseImage.flipX);
    canvas.renderAll();
    snapshot();
  };
  document.getElementById('btn-flip-v').onclick = () => {
    if (!baseImage) return;
    baseImage.set('flipY', !baseImage.flipY);
    canvas.renderAll();
    snapshot();
  };

  function rotateImage(deg) {
    if (!baseImage) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 / zoom });
    const img = new Image();
    img.onload = () => {
      const off = document.createElement('canvas');
      const swap = Math.abs(deg) === 90;
      off.width = swap ? img.height : img.width;
      off.height = swap ? img.width : img.height;
      const ctx = off.getContext('2d');
      ctx.translate(off.width / 2, off.height / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      loadImageFromDataUrl(off.toDataURL('image/png'), currentFilePath);
    };
    img.src = dataUrl;
  }

  // ---------- Tool switching ----------
  const toolButtons = document.querySelectorAll('.tool-btn');
  toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  function setTool(tool) {
    currentTool = tool;
    toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    canvas.isDrawingMode = tool === 'draw';
    canvas.selection = tool === 'select';
    canvas.forEachObject((o) => {
      if (!o.isBase) o.selectable = tool === 'select';
    });
    canvas.defaultCursor = tool === 'select' ? 'default' : 'crosshair';

    if (tool === 'draw') {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = document.getElementById('draw-color').value;
      canvas.freeDrawingBrush.width = parseInt(document.getElementById('draw-width').value, 10);
    }

    if (tool === 'crop') {
      startCrop();
    } else {
      cancelCrop();
    }

    canvas.discardActiveObject();
    canvas.renderAll();
  }

  // ---------- Draw / shape style ----------
  const drawColor = document.getElementById('draw-color');
  const drawWidth = document.getElementById('draw-width');
  drawColor.addEventListener('input', () => {
    if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = drawColor.value;
  });
  drawWidth.addEventListener('input', () => {
    if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.width = parseInt(drawWidth.value, 10);
  });

  // ---------- Shape drawing (rect/circle/line) ----------
  canvas.on('mouse:down', (opt) => {
    if (!baseImage) return;
    const pointer = canvas.getPointer(opt.e);

    if (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'line') {
      isDrawingShape = true;
      shapeStart = pointer;
      const color = drawColor.value;
      const width = parseInt(drawWidth.value, 10);
      const fill = document.getElementById('shape-fill').checked;

      if (currentTool === 'rect') {
        activeShape = new fabric.Rect({
          left: pointer.x, top: pointer.y, width: 1, height: 1,
          stroke: color, strokeWidth: width, fill: fill ? color : 'transparent'
        });
      } else if (currentTool === 'circle') {
        activeShape = new fabric.Ellipse({
          left: pointer.x, top: pointer.y, rx: 1, ry: 1,
          stroke: color, strokeWidth: width, fill: fill ? color : 'transparent'
        });
      } else if (currentTool === 'line') {
        activeShape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: color, strokeWidth: width
        });
      }
      canvas.add(activeShape);
    } else if (currentTool === 'text') {
      const textbox = new fabric.IText('Double-click to edit', {
        left: pointer.x,
        top: pointer.y,
        fontSize: parseInt(document.getElementById('text-size').value, 10),
        fill: document.getElementById('text-color').value,
        fontFamily: document.getElementById('text-font').value,
        fontWeight: document.getElementById('text-bold').checked ? 'bold' : 'normal'
      });
      canvas.add(textbox);
      setTool('select');
      canvas.setActiveObject(textbox);
      textbox.enterEditing();
    } else if (currentTool === 'erase') {
      const target = canvas.findTarget(opt.e, false);
      if (target && !target.isBase) canvas.remove(target);
    }
  });

  canvas.on('mouse:move', (opt) => {
    if (!isDrawingShape || !activeShape) return;
    const pointer = canvas.getPointer(opt.e);
    if (currentTool === 'rect') {
      activeShape.set({
        width: Math.abs(pointer.x - shapeStart.x),
        height: Math.abs(pointer.y - shapeStart.y),
        left: Math.min(pointer.x, shapeStart.x),
        top: Math.min(pointer.y, shapeStart.y)
      });
    } else if (currentTool === 'circle') {
      activeShape.set({
        rx: Math.abs(pointer.x - shapeStart.x) / 2,
        ry: Math.abs(pointer.y - shapeStart.y) / 2,
        left: Math.min(pointer.x, shapeStart.x),
        top: Math.min(pointer.y, shapeStart.y)
      });
    } else if (currentTool === 'line') {
      activeShape.set({ x2: pointer.x, y2: pointer.y });
    }
    canvas.renderAll();
  });

  canvas.on('mouse:up', () => {
    if (isDrawingShape) {
      isDrawingShape = false;
      if (activeShape) snapshot();
      activeShape = null;
      setTool('select');
    }
  });

  // ---------- Crop ----------
  function startCrop() {
    if (!baseImage) return;
    cropRect = new fabric.Rect({
      left: baseImage.width * 0.1,
      top: baseImage.height * 0.1,
      width: baseImage.width * 0.8,
      height: baseImage.height * 0.8,
      fill: 'rgba(0,150,255,0.15)',
      stroke: '#00b4ff',
      strokeDashArray: [6, 4],
      cornerColor: '#00b4ff',
      transparentCorners: false,
      selectable: true,
      evented: true
    });
    canvas.add(cropRect);
    canvas.setActiveObject(cropRect);
    canvas.renderAll();
  }

  function cancelCrop() {
    if (cropRect) {
      canvas.remove(cropRect);
      cropRect = null;
      canvas.renderAll();
    }
  }

  document.getElementById('btn-cancel-crop').onclick = () => {
    cancelCrop();
    setTool('select');
  };

  document.getElementById('btn-apply-crop').onclick = () => {
    if (!cropRect || !baseImage) return;
    const rectState = cropRect.getBoundingRect();
    const left = Math.max(0, rectState.left);
    const top = Math.max(0, rectState.top);
    const width = Math.min(baseImage.width - left, rectState.width);
    const height = Math.min(baseImage.height - top, rectState.height);

    canvas.remove(cropRect);
    cropRect = null;
    canvas.discardActiveObject();
    canvas.renderAll();

    const dataUrl = canvas.toDataURL({ format: 'png', left, top, width, height, multiplier: 1 });
    loadImageFromDataUrl(dataUrl, currentFilePath);
    setTool('select');
  };

  // ---------- Resize ----------
  const widthInput = document.getElementById('resize-width');
  const heightInput = document.getElementById('resize-height');
  const lockAspect = document.getElementById('resize-lock');
  let aspectRatio = 1;

  function syncResizeInputs() {
    if (!baseImage) return;
    widthInput.value = Math.round(baseImage.width);
    heightInput.value = Math.round(baseImage.height);
    aspectRatio = baseImage.width / baseImage.height;
  }

  widthInput.addEventListener('input', () => {
    if (lockAspect.checked) {
      heightInput.value = Math.round(parseInt(widthInput.value || '1', 10) / aspectRatio);
    }
  });
  heightInput.addEventListener('input', () => {
    if (lockAspect.checked) {
      widthInput.value = Math.round(parseInt(heightInput.value || '1', 10) * aspectRatio);
    }
  });

  document.getElementById('btn-apply-resize').onclick = () => {
    if (!baseImage) return;
    const newW = Math.max(1, parseInt(widthInput.value, 10));
    const newH = Math.max(1, parseInt(heightInput.value, 10));
    const scaleX = newW / baseImage.width;
    const scaleY = newH / baseImage.height;

    canvas.getObjects().forEach((o) => {
      o.set({
        left: o.left * scaleX,
        top: o.top * scaleY,
        scaleX: (o.scaleX || 1) * scaleX,
        scaleY: (o.scaleY || 1) * scaleY
      });
      o.setCoords();
    });
    canvas.setDimensions({ width: newW, height: newH });
    canvas.renderAll();
    fitCanvasToWrap();
    snapshot();
    updateEmptyState();
  };

  // ---------- Adjustments (Fabric filters) ----------
  const F = fabric.Image.filters;
  const adjustmentIds = ['brightness', 'contrast', 'saturation', 'hue', 'gamma', 'sharpen', 'blur', 'noise', 'vignette'];

  function applyAdjustments() {
    if (!baseImage) return;
    const get = (id) => parseFloat(document.getElementById('adj-' + id).value);
    const filters = [];

    const brightness = get('brightness') / 100;
    if (brightness !== 0) filters.push(new F.Brightness({ brightness }));

    const contrast = get('contrast') / 100;
    if (contrast !== 0) filters.push(new F.Contrast({ contrast }));

    const saturation = get('saturation') / 100;
    if (saturation !== 0) filters.push(new F.Saturation({ saturation }));

    const hue = get('hue');
    if (hue !== 0) filters.push(new F.HueRotation({ rotation: (hue * Math.PI) / 180 }));

    const gamma = get('gamma') / 100;
    if (gamma !== 1) filters.push(new F.Gamma({ gamma: [gamma, gamma, gamma] }));

    const sharpen = get('sharpen');
    if (sharpen > 0) {
      const s = sharpen / 100;
      filters.push(new F.Convolute({
        matrix: [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0]
      }));
    }

    const blur = get('blur');
    if (blur > 0) filters.push(new F.Blur({ blur: blur / 100 }));

    const noise = get('noise');
    if (noise > 0) filters.push(new F.Noise({ noise }));

    const vignette = get('vignette');
    if (vignette > 0) {
      filters.push(new F.Convolute({ matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0] }));
    }

    baseImage.filters = filters;
    baseImage.applyFilters();
    canvas.renderAll();
  }

  adjustmentIds.forEach((id) => {
    document.getElementById('adj-' + id).addEventListener('input', applyAdjustments);
    document.getElementById('adj-' + id).addEventListener('change', snapshot);
  });

  function resetAdjustmentUI() {
    document.getElementById('adj-brightness').value = 0;
    document.getElementById('adj-contrast').value = 0;
    document.getElementById('adj-saturation').value = 0;
    document.getElementById('adj-hue').value = 0;
    document.getElementById('adj-gamma').value = 100;
    document.getElementById('adj-sharpen').value = 0;
    document.getElementById('adj-blur').value = 0;
    document.getElementById('adj-noise').value = 0;
    document.getElementById('adj-vignette').value = 0;
    syncResizeInputs();
  }

  document.getElementById('btn-reset-adjust').onclick = () => {
    resetAdjustmentUI();
    applyAdjustments();
    snapshot();
  };

  // ---------- Preset filters ----------
  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!baseImage) return;
      const name = btn.dataset.filter;
      let filters = [];
      switch (name) {
        case 'grayscale':
          filters = [new F.Grayscale()];
          break;
        case 'sepia':
          filters = [new F.Sepia()];
          break;
        case 'invert':
          filters = [new F.Invert()];
          break;
        case 'vintage':
          filters = [new F.Sepia(), new F.Brightness({ brightness: -0.05 }), new F.Noise({ noise: 20 })];
          break;
        case 'polaroid':
          filters = [new F.Saturation({ saturation: -0.2 }), new F.Contrast({ contrast: 0.05 }), new F.Brightness({ brightness: 0.05 })];
          break;
        case 'technicolor':
          filters = [new F.Saturation({ saturation: 0.5 }), new F.Contrast({ contrast: 0.1 })];
          break;
        case 'blackwhite':
          filters = [new F.Grayscale(), new F.Contrast({ contrast: 0.15 })];
          break;
        case 'none':
        default:
          filters = [];
      }
      baseImage.filters = filters;
      baseImage.applyFilters();
      canvas.renderAll();
      resetAdjustmentUI();
      snapshot();
    });
  });

  // ---------- Drag & drop ----------
  canvasWrap.addEventListener('dragover', (e) => e.preventDefault());
  canvasWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadImageFromDataUrl(reader.result, file.path);
    reader.readAsDataURL(file);
  });

  window.addEventListener('resize', () => fitCanvasToWrap());

  updateEmptyState();
  setTool('select');
})();
