import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Line, Text, Circle, Image } from "react-konva";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

// === アプリ本体 ===
export default function App() {
  // ニックネーム管理
  const [nickname, setNickname] = useState(localStorage.getItem("nickname") || "");
  const [isNameSet, setIsNameSet] = useState(!!nickname);

  // Yjs共有データ
  const ydoc = useRef(new Y.Doc()).current;
  const [room] = useState(() => {
    const hash = window.location.hash || "#gunroom-default";
    return hash.replace("#", "");
  });
  const provider = useRef(new WebrtcProvider(room, ydoc)).current;
  const counties = ydoc.getArray("counties"); // 郡データ
  const sites = ydoc.getArray("sites");       // 要所データ

  // React用のstate
  const [countyList, setCountyList] = useState([]);
  const [siteList, setSiteList] = useState([]);
  const [tool, setTool] = useState("move"); // ツールモード
  const [drawingPoints, setDrawingPoints] = useState([]);
  const stageRef = useRef();

  // 背景画像
  const [bgImage, setBgImage] = useState(null);

  // --- Yjs同期 ---
  useEffect(() => {
    const update = () => {
      setCountyList(counties.toArray());
      setSiteList(sites.toArray());
    };
    counties.observe(update);
    sites.observe(update);
    update();
    return () => {
      counties.unobserve(update);
      sites.unobserve(update);
    };
  }, [counties, sites]);

  // ニックネームセット
  useEffect(() => {
    if (nickname) {
      localStorage.setItem("nickname", nickname);
    }
  }, [nickname]);

  // 背景画像読込
  const loadBg = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.src = reader.result;
      img.onload = () => setBgImage(img);
    };
    reader.readAsDataURL(file);
  };

  // マウスクリック処理
  const handleStageClick = (e) => {
    const pos = e.target.getStage().getPointerPosition();
    if (tool === "draw-county") {
      setDrawingPoints([...drawingPoints, pos.x, pos.y]);
    } else if (tool.startsWith("place-")) {
      const type = tool.split("-")[1]; // castle / temple / other
      sites.push([
        {
          id: Date.now().toString(),
          type,
          name: type === "castle" ? "城" : type === "temple" ? "寺社" : "要所",
          x: pos.x,
          y: pos.y,
        },
      ]);
    }
  };

  // 多角形確定（Enterキー）
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Enter" && drawingPoints.length >= 6) {
        counties.push([
          {
            id: Date.now().toString(),
            name: "郡",
            points: drawingPoints,
          },
        ]);
        setDrawingPoints([]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [drawingPoints, counties]);

  // 保存
  const saveJson = () => {
    const data = { counties: counties.toArray(), sites: sites.toArray() };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "map.json";
    a.click();
  };

  // 読込
  const loadJson = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = JSON.parse(reader.result);
      counties.delete(0, counties.length);
      sites.delete(0, sites.length);
      counties.push(data.counties || []);
      sites.push(data.sites || []);
    };
    reader.readAsText(file);
  };

  // 要所アイコン
  const siteIcon = (type) => {
    if (type === "castle") return "🏯";
    if (type === "temple") return "⛩️";
    return "⭐";
  };

  // --- UI ---
  if (!isNameSet) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="p-4 border rounded bg-white">
          <h1 className="mb-2 font-bold">ニックネームを入力</h1>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="border p-1"
          />
          <button
            onClick={() => setIsNameSet(true)}
            className="ml-2 px-2 py-1 bg-blue-500 text-white rounded"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* ツールバー */}
      <div className="p-2 bg-gray-200 flex gap-2">
        <button onClick={() => setTool("draw-county")}>郡を描く</button>
        <button onClick={() => setTool("place-castle")}>城</button>
        <button onClick={() => setTool("place-temple")}>寺社</button>
        <button onClick={() => setTool("place-other")}>その他</button>
        <button onClick={() => setTool("move")}>移動</button>
        <input type="file" accept="image/*" onChange={loadBg} />
        <button onClick={saveJson}>保存</button>
        <input type="file" accept="application/json" onChange={loadJson} />
      </div>

      {/* キャンバス */}
      <div className="flex-1">
        <Stage
          width={window.innerWidth}
          height={window.innerHeight - 40}
          onClick={handleStageClick}
          ref={stageRef}
        >
          <Layer>
            {bgImage && <Image image={bgImage} />}
            {/* 郡描画 */}
            {countyList.map((c) => (
              <Line
                key={c.id}
                points={c.points}
                closed
                stroke="black"
                fill="rgba(0,0,255,0.1)"
              />
            ))}
            {drawingPoints.length > 0 && (
              <Line points={drawingPoints} stroke="red" />
            )}
            {/* 要所 */}
            {siteList.map((s) => (
              <React.Fragment key={s.id}>
                <Text text={siteIcon(s.type)} x={s.x} y={s.y} fontSize={24} />
                <Text text={s.name} x={s.x} y={s.y - 18} fontSize={14} />
              </React.Fragment>
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

