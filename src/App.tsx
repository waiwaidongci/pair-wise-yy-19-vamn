import { useEffect, useMemo } from 'react';
import { Badge, Box, Button, HStack, Text } from '@chakra-ui/react';
import { Boxes, FileOutput, LayoutGrid, Ruler, Scissors, Settings2 } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { projectAtom, projectStatsAtom } from './stores/project';
import { activeTaskAtom, activeTaskProgressAtom, dispatchCutTaskAtom } from './stores/cutTasks';
import { projectFingerprint } from './utils/cutTasks';

const navItems = [
  { path: '/design', label: '零件与榫卯', icon: LayoutGrid },
  { path: '/nesting', label: '板材排料', icon: Boxes },
  { path: '/cutting', label: '开料任务', icon: Scissors },
  { path: '/export', label: '清单与交付', icon: FileOutput },
];

export default function App() {
  const location = useLocation();
  const [project, setProject] = useAtom(projectAtom);
  const stats = useAtomValue(projectStatsAtom);
  const activeTask = useAtomValue(activeTaskAtom);
  const cutProgress = useAtomValue(activeTaskProgressAtom);
  const dispatchCutTask = useSetAtom(dispatchCutTaskAtom);

  // 零件尺寸或板材参数变化时，进行中任务的未完成签收立即失效，已切记录转入复核
  const fingerprint = useMemo(() => projectFingerprint(project), [project]);
  useEffect(() => {
    dispatchCutTask({ type: 'sync-fingerprint', fingerprint });
  }, [fingerprint, dispatchCutTask]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <HStack spacing="10px">
          <Box className="brand-mark"><Ruler size={20} /></Box>
          <Box>
            <Text fontSize="16px" fontWeight="900" lineHeight="1">JoineryNest</Text>
            <Text fontSize="10px" color="slate.400" mt="3px">木工榫卯与板材切割清单</Text>
          </Box>
        </HStack>
        <HStack spacing="6px" className="main-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path} className={location.pathname === item.path ? 'active' : ''}>
                <Icon size={15} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </HStack>
        <HStack justifySelf="end">
          <Badge colorScheme="teal" variant="subtle">{stats.result.sheetCount} 张板 · {stats.result.utilization.toFixed(1)}%</Badge>
          <Button size="xs" variant="ghost" color="slate.300" leftIcon={<Settings2 size={14} />} onClick={() => {
            setProject((current) => ({ ...current, updatedAt: Date.now() }));
          }}>保存状态</Button>
        </HStack>
      </header>
      <div className="project-strip">
        <Text fontSize="10px" color="slate.500">当前项目</Text>
        <Text fontSize="12px" fontWeight="800">{project.name}</Text>
        <span />
        <Text fontSize="10px" color="slate.500">客户</Text>
        <Text fontSize="11px">{project.client}</Text>
        <span />
        <Text fontSize="10px" color="slate.500">安装位置</Text>
        <Text fontSize="11px">{project.sheet}</Text>
        <Box flex="1" />
        <Text fontSize="10px" color="slate.500">
          {activeTask && cutProgress
            ? `${activeTask.code} 已切 ${cutProgress.cut} · 待切 ${cutProgress.pending} · 差异 ${cutProgress.diff}`
            : '开料任务未发起'}
        </Text>
        <span />
        <Text fontSize="10px" color="slate.500">锯缝 {project.kerf} mm · 修边 {project.trim} mm</Text>
      </div>
      <Outlet />
    </div>
  );
}

