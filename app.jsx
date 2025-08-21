import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Circle, Text, Image as KonvaImage, Group, Rect } from "react-konva";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { nanoid } from "nanoid";
import { motion } from "framer-motion";
import { Download, Upload, Users, MousePointer2, PencilRuler, Hand, Trash2, Type, Image as ImageIcon, Copy, Share2, Save, UploadCloud, FolderOpen, MapPin, Eraser, Palette, MousePointerSquareDashed } from "lucide-react";

// ------------------------------
// 1) 便利関数
// ------------------------------
const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const NAME_WORDS1 = ["青", "赤", "桃", "黄", "緑", "藍", "橙", "紫", "茶", "白", "黒", "銀", "金"]; 
const NAME_WORDS2 = ["猫", "狐", "鶴", "虎", "龍", "鮫", "梟", "狼", "鹿", "鯨", "隼"]; 
const COLORS = ["#ef4444","#f97316","#f59e0b","#84cc16","#10b981","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#14b8a6","#eab308"]; 
const genUser = () => ({
  id: nanoid(8),
  name: randomFrom(NAME_WORDS1) + randomFrom(NAME_WORDS2),
  color: randomFrom(COLORS)
});

function centroid(points) {
  // points: [x1,y1,x2,y2,...]
  let xs = 0, ys = 0, n = points.length/2;
  for (let i=0;i<points.length;i+=2){ xs += points[i]; ys += points[i+1]; }
  return { x: xs / n, y: ys / n };
}

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
}

function dataUrlDownload(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// ------------------------------
// 2) 共有ドキュメント（Yjs）
// ------------------------------
const ensureRoomId = () => {
  if (location.hash.slice(1)) return location.hash.slice(1);
  const id = `gunroom-${nanoid(6)}`;
  location.hash = id;
  return id;
};

// Shape 型
// type: 'polygon'
// { id, type, points:number[], fill, stroke, label, visible }

// ------------------------------
// 3) 画像読み込み Hook
// ------------------------------
function useImage(src) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!src) { setImage(null); return; }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  return image;
}

// ------------------------------
// 4) メインコンポーネント
// ------------------------------
export default function App() {
  // ルーム / ユーザー
  const roomId = useMemo(() => ensureRoomId(), []);
  const me = useMemo(() => genUser(), []);

  // Yjs セットアップ
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const shapesRef = useRef(null); // Y.Array
  const [connectedPeers, setConnectedPeers] = useState(1);

  // 共有ステート
  const [shapes, setShapes] = useState([]); // ローカル表示用

  // 作業状態
  const [tool, setTool] = useState("pan"); // 'pan' | 'draw' | 'edit' | 'erase' | 'label'
  const [draftPoints, setDraftPoints] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({x:0, y:0});

  // 背景
  const [bgUrl, setBgUrl] = useState("");
  const [bgOpacity, setBgOpacity] = useState(0.7);
  const bgImage = useImage(bgUrl);

  // Awareness（カーソル共有）
  const [cursors, setCursors] = useState({});
  const stageRef = useRef(null);

  // 初期化
  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new WebrtcProvider(roomId, ydoc, {
      // デフォルトの public signaling を利用（匿名OK）
      // 必要ならシグナリングサーバー追加可
      // signaling: ["wss://signaling.yjs.dev"],
      password: undefined,
      awareness: new Y.awarenessProtocol.Awareness(ydoc),
    });

    const yShapes = ydoc.getArray("shapes");
    ydocRef.current = ydoc;
    providerRef.current = provider;
    shapesRef.current = yShapes;

    // Awareness: 自分の情報
    provider.awareness.setLocalStateField('user', { id: me.id, name: me.name, color: me.color });

    // Awareness: カーソル
    const onAwarenessUpdate = () => {
      const states = provider.awareness.getStates();
      const obj = {};
      states.forEach((st, clientId) => { if (st && st.cursor) obj[clientId] = { ...st.user, ...st.cursor }; });
      setCursors(obj);
      setConnectedPeers(states.size);
    };
    provider.awareness.on('change', onAwarenessUpdate);

    // shapes の変更を購読
    const updateLocal = () => setShapes(yShapes.toArray());
    yShapes.observe(updateLocal);
    updateLocal();

    return () => {
      yShapes.unobserve(updateLocal);
      provider.awareness.off('change', onAwarenessUpdate);
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomId, me.id, me.name, me.color]);

  // ステージ上のドラッグパン
  const isPanning = tool === 'pan';

  // クリックで多角形作成
  const handleStageClick = (e) => {
    if (tool !== 'draw') return;
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    const p = [(pointer.x - stagePos.x)/stageScale, (pointer.y - stagePos.y)/stageScale];
    setDraftPoints(prev => [...prev, ...p]);
  };

  const finishPolygon = () => {
    if (draftPoints.length < 6) { setDraftPoints([]); return; } // 3点未満
    const shape = {
      id: nanoid(8),
      type: 'polygon',
      points: draftPoints,
      fill: randomFrom(COLORS) + 'CC',
      stroke: '#111827',
      label: '',
      visible: true,
    };
    shapesRef.current.push([shape]);
    setDraftPoints([]);
  };

  // キーボード操作
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' && tool === 'draw') finishPolygon();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        deleteShape(selectedId);
      }
      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
        // 超簡易undo: 最後の要素を消す
        const arr = shapesRef.current;
        if (arr.length > 0) arr.delete(arr.length-1, 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, selectedId]);

  const updateShape = (id, patch) => {
    const arr = shapesRef.current;
    const idx = arr.toArray().findIndex(s => s.id === id);
    if (idx >= 0) {
      const s = { ...arr.get(idx), ...patch };
      arr.delete(idx, 1);
      arr.insert(idx, [s]);
    }
  };

  const deleteShape = (id) => {
    const arr = shapesRef.current;
    const idx = arr.toArray().findIndex(s => s.id === id);
    if (idx >= 0) arr.delete(idx, 1);
    setSelectedId(null);
  };

  // 点ドラッグ
  const handleAnchorDrag = (id, pointIndex, newPos) => {
    const arr = shapesRef.current;
    const idx = arr.toArray().findIndex(s => s.id === id);
    if (idx < 0) return;
    const s = arr.get(idx);
    const pts = [...s.points];
    pts[pointIndex*2] = (newPos.x - stagePos.x)/stageScale;
    pts[pointIndex*2+1] = (newPos.y - stagePos.y)/stageScale;
    updateShape(id, { points: pts });
  };

  // PNG / JSON エクスポート
  const exportJSON = () => {
    const data = JSON.stringify({ version: 1, shapes, bgUrl }, null, 2);
    download(`gunmap-${roomId}.json`, data);
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const arr = shapesRef.current;
        arr.delete(0, arr.length);
        if (Array.isArray(data.shapes)) arr.push(data.shapes);
        if (data.bgUrl) setBgUrl(data.bgUrl);
      } catch (e) {
        alert('JSONの読み込みに失敗しました');
      }
    };
    reader.readAsText(file);
  };

  const exportPNG = async () => {
    const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
    dataUrlDownload(`gunmap-${roomId}.png`, uri);
  };

  // 画像アップロード
  const onBgFile = (file) => {
    const url = URL.createObjectURL(file);
    setBgUrl(url);
  };

  // Awareness: マウス移動
  const onMouseMove = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const provider = providerRef.current;
    if (!provider) return;
    provider.awareness.setLocalStateField('cursor', { x: pos.x, y: pos.y });
  };

  // ツールバーアイテム
  const ToolButton = ({active, onClick, title, children}) => (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-2 px-3 py-2 rounded-2xl shadow ${active? 'bg-black text-white':'bg-white text-gray-800 hover:bg-gray-100'} border border-gray-200`}
    >{children}</button>
  );

  // ステージ寸法
  const [size, setSize] = useState({ width: 1200, height: 800 });
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight - 80 });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // UI: ラベル入力
  const [pendingLabel, setPendingLabel] = useState("");
  const addLabelToSelected = () => {
    if (!selectedId) return;
    updateShape(selectedId, { label: pendingLabel });
    setPendingLabel("");
  };

  // UI: 色変更
  const applyColor = (color) => {
    if (!selectedId) return;
    updateShape(selectedId, { fill: color });
  };

  // ドラッグでパン & ホイールでズーム
  const onWheel = (e) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stageScale;
    const mousePointTo = {
      x: (stage.getPointerPosition().x - stagePos.x) / oldScale,
      y: (stage.getPointerPosition().y - stagePos.y) / oldScale,
    };
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const newPos = {
      x: stage.getPointerPosition().x - mousePointTo.x * newScale,
      y: stage.getPointerPosition().y - mousePointTo.y * newScale,
    };
    setStageScale(newScale);
    setStagePos(newPos);
  };

  return (
    <div className="w-full h-screen bg-gray-50 text-gray-900">
      {/* Top Bar */}
      <div className="h-16 px-4 flex items-center justify-between bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">郡マップ共同編集</span>
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border">Room: {roomId}</span>
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border flex items-center gap-1"><Users size={14}/>Peers: {connectedPeers}</span>
        </div>
        <div className="flex items-center gap-2">
          <ToolButton active={tool==='pan'} onClick={()=>setTool('pan')} title="移動 / ズーム"><Hand size={16}/>移動</ToolButton>
          <ToolButton active={tool==='draw'} onClick={()=>setTool('draw')} title="郡ポリゴンを描く"><PencilRuler size={16}/>描く</ToolButton>
          <ToolButton active={tool==='edit'} onClick={()=>setTool('edit')} title="頂点編集"><MousePointerSquareDashed size={16}/>編集</ToolButton>
          <ToolButton active={tool==='erase'} onClick={()=>setTool('erase')} title="削除"><Eraser size={16}/>削除</ToolButton>
          <ToolButton active={tool==='label'} onClick={()=>setTool('label')} title="ラベル"><Type size={16}/>ラベル</ToolButton>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-2 rounded-2xl border bg-white cursor-pointer">
            <ImageIcon size={16}/> 背景
            <input type="file" accept="image/*" className="hidden" onChange={e=>e.target.files && onBgFile(e.target.files[0])}/>
          </label>
          <button className="flex items-center gap-2 px-3 py-2 rounded-2xl border bg-white" onClick={exportPNG}><Download size={16}/> PNG</button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-2xl border bg-white" onClick={exportJSON}><Save size={16}/> JSON保存</button>
          <label className="flex items-center gap-2 px-3 py-2 rounded-2xl border bg-white cursor-pointer">
            <FolderOpen size={16}/> JSON読込
            <input type="file" accept="application/json" className="hidden" onChange={e=>e.target.files && importJSON(e.target.files[0])}/>
          </label>
          <button className="flex items-center gap-2 px-3 py-2 rounded-2xl border bg-white" onClick={()=>{navigator.clipboard.writeText(location.href)}}><Share2 size={16}/>共有URL</button>
        </div>
      </div>

      {/* Sub Bar */}
      <div className="h-14 px-4 flex items-center justify-between bg-white/70 border-b border-gray-200 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">背景不透明度</span>
            <input type="range" min={0} max={1} step={0.05} value={bgOpacity} onChange={e=>setBgOpacity(parseFloat(e.target.value))}/>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">ラベル</span>
            <input value={pendingLabel} onChange={e=>setPendingLabel(e.target.value)} placeholder="郡名など" className="px-2 py-1 border rounded"/>
            <button className="px-3 py-1 rounded bg-black text-white" onClick={addLabelToSelected}>設定</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">色</span>
            {COLORS.map(c => (
              <button key={c} onClick={()=>applyColor(c+"CC")} className="w-6 h-6 rounded-full border" style={{background:c}} />
            ))}
          </div>
        </div>
        <div className="text-sm text-gray-600">
          {tool==='draw' && <span>クリックで頂点追加、Enterで確定。</span>}
          {tool==='edit' && <span>点をドラッグで形修正。Deleteで削除。</span>}
          {tool==='pan' && <span>ドラッグで移動、ホイールでズーム。</span>}
          {tool==='label' && <span>図形をクリック→上の入力欄からラベル設定。</span>}
          {tool==='erase' && <span>図形をクリックで削除。</span>}
        </div>
      </div>

      {/* Canvas Area */}
      <div className="w-full" onContextMenu={(e)=>e.preventDefault()}>
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          draggable={isPanning}
          x={stagePos.x}
          y={stagePos.y}
          scaleX={stageScale}
          scaleY={stageScale}
          onDragEnd={(e)=> setStagePos({x:e.target.x(), y:e.target.y()})}
          onWheel={onWheel}
          onClick={handleStageClick}
          onMouseMove={onMouseMove}
          style={{ background: '#f8fafc' }}
        >
          <Layer>
            {/* 背景画像 */}
            {bgImage && (
              <KonvaImage image={bgImage} opacity={bgOpacity} x={0} y={0} />
            )}

            {/* 図形 */}
            {shapes.map(s => (
              <Group key={s.id}
                onClick={(e)=>{
                  if (tool==='erase') { deleteShape(s.id); return; }
                  setSelectedId(s.id);
                  if (tool==='label') {
                    // クリック直後に入力欄へ誘導
                    const el = document.querySelector('input[placeholder="郡名など"]');
                    el && el.focus();
                  }
                }}
              >
                <Line
                  points={s.points}
                  closed
                  fill={s.fill}
                  stroke={s.stroke}
                  strokeWidth={2}
                />
                {s.label && (
                  <Text {...centroid(s.points)} text={s.label} fontFamily="ui-sans-serif, system-ui" fontSize={16} fill="#111827" offsetX={s.label.length*8/2} />
                )}
                {/* 編集モードのアンカー */}
                {tool==='edit' && s.id===selectedId && (
                  s.points.reduce((acc, val, idx) => {
                    if (idx%2===0) acc.push({x:s.points[idx], y:s.points[idx+1], i:(idx/2)|0});
                    return acc;
                  }, []).map(p => (
                    <Circle key={p.i}
                      x={p.x}
                      y={p.y}
                      radius={6}
                      fill="#ffffff"
                      stroke="#111827"
                      strokeWidth={2}
                      draggable
                      onDragMove={(e)=>handleAnchorDrag(s.id, p.i, e.target.position())}
                    />
                  ))
                )}
              </Group>
            ))}

            {/* 描画中の下書き */}
            {draftPoints.length>=2 && (
              <Line points={draftPoints} stroke="#111827" dash={[6,6]} strokeWidth={2} />
            )}

            {/* 共同編集カーソル */}
            {Object.entries(cursors).map(([cid, cur]) => (
              <Group key={cid} x={cur.x} y={cur.y} opacity={0.9}>
                <Rect x={8} y={10} width={80} height={22} fill="white" opacity={0.9} cornerRadius={6} />
                <Text x={12} y={12} text={cur.name||'user'} fontSize={12} fill="#111827" />
                <Circle radius={5} fill={cur.color||'#3b82f6'} />
                <Line points={[0,0, 12,12]} stroke={cur.color||'#3b82f6'} strokeWidth={3} />
              </Group>
            ))}
          </Layer>
        </Stage>
      </div>

      {/* Footer */}
      <div className="h-10 text-xs flex items-center justify-center text-gray-600">
        <span>匿名リアルタイム共有: このURLを渡すだけ / ルームIDはアドレスの # 以降。作図: クリック追加→Enterで確定。選択中Deleteで削除。</span>
      </div>
    </div>
  );
}

