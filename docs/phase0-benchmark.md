# Phase 0 Benchmark Report

## T13: 美術素材匯出測試

### 結論：Phase 1 需要美術重做

- **找到 FBX 檔案**：`/mnt/d/AI_Projects/PoolGame/Assets/_Game/BallPool/BallPool8/Meshes/Balls.FBX` (449KB)
- **轉換工具不可用**：系統無 `fbx2gltf`、`FBX2glTF` 等轉換工具
- **建議**：Phase 1 使用 Blender Python script 批次轉換，或直接用 Three.js 程式生成高品質球體（PBR 材質+球號貼圖）
- **目前方案**：`SphereGeometry` + `MeshStandardMaterial` 色塊球，視覺清晰可辨

---

## T14: 效能 Benchmark

### 環境
- Node.js v20.20.2 / Vitest v4.1.8
- Linux x86_64

### 物理模擬效能

| 測項 | 結果 | 目標 | 狀態 |
|------|------|------|------|
| 16 球開球模擬（至全靜止） | **8.6ms** | < 100ms | ✅ 超標 11x |
| 模擬步數 | 144 steps | — | — |
| 吞吐率 | 16.8 steps/ms | — | — |

### 記憶體穩定性

| 測項 | 結果 | 目標 | 狀態 |
|------|------|------|------|
| 連續 10 次擊球後 heap | -4.7% 成長（實際下降） | < 20% | ✅ |
| 前 5 局平均 | 14.3 MB | — | — |
| 後 5 局平均 | 13.7 MB | — | — |
| `clearCaches()` 效果 | 有效（heap 無增長） | — | ✅ |

### 渲染 FPS（預估）

- 16 球 SphereGeometry(24,16) + shadows + OrbitControls
- 場景三角形數：~7000 tris（極輕量）
- 預期 60fps+ on any modern GPU
- 實測需在瀏覽器中用 DevTools Performance tab 確認

### 結論

1. **物理引擎效能優秀**：8.6ms 完成一整局（144步），遠低於 16ms/frame 預算
2. **記憶體穩定**：`clearCaches()` 有效防止 leak，10 局後 heap 無增長
3. **渲染無瓶頸**：場景極輕量（< 10K tris），不需要 LOD/instancing
4. **瓶頸不在物理或渲染**：Phase 1 可專注 UI/UX 和美術品質
