# JoineryNest 木工榫卯与板材切割清单

基于 React、TypeScript、Vite、Chakra UI、Jotai、React Router 和 Canvas 构建。排料算法与
排料图渲染均为本地实现，项目数据自动保存在浏览器中。

## 功能

- 柜体与桌案零件建模：长、宽、厚、数量、板材和纹理方向
- 榫卯连接设计：燕尾榫、直榫、搭槽、圆木榫和饼干榫
- 按板材规格生成多张排料图，考虑锯缝、修边余量和纹理限制
- 利用率、废料面积、板材采购量和预计成本
- 在 Canvas 上拖动或输入坐标微调零件，并标记重叠风险
- 零件或连接修改后自动更新排料图和切割清单
- 开料任务：发起时冻结排料版本并登记工位，零件按编号签收，重签只留第一次及原工位
- 尺寸或板材参数变化使未完成签收失效，已切记录保留到复核，旧尺寸不混入当前清单
- 本地保存失败恢复到最近完成的任务，签收重放不重复入库；旧项目升级自动补录首版任务
- 项目文件保存 / 载入，零件表、排料图、用料说明、开料进度单和 SVG 导出

## 运行

```bash
export PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH"
corepack pnpm install
corepack pnpm build
corepack pnpm dev
```

