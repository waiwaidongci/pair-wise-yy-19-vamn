import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  HStack,
  Input,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
} from '@chakra-ui/react';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ClipboardCheck,
  History,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { nestingResultAtom, projectAtom } from '../stores/project';
import {
  activeTaskAtom,
  activeTaskProgressAtom,
  cutTaskNoticeAtom,
  dispatchCutTaskAtom,
  heldSignoffsAtom,
  replayQueueAtom,
  reviewLogAtom,
  taskHistoryAtom,
} from '../stores/cutTasks';
import { buildSignoff, taskPieces, type TaskPiece } from '../utils/cutTasks';

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const DEFAULT_WORKSTATIONS = ['开料一组', '开料二组'];

export function CuttingView() {
  const project = useAtomValue(projectAtom);
  const result = useAtomValue(nestingResultAtom);
  const activeTask = useAtomValue(activeTaskAtom);
  const progress = useAtomValue(activeTaskProgressAtom);
  const reviewLog = useAtomValue(reviewLogAtom);
  const history = useAtomValue(taskHistoryAtom);
  const held = useAtomValue(heldSignoffsAtom);
  const replayQueue = useAtomValue(replayQueueAtom);
  const [notice, setNotice] = useAtom(cutTaskNoticeAtom);
  const dispatch = useSetAtom(dispatchCutTaskAtom);
  const toast = useToast();

  const [registerWorkstation, setRegisterWorkstation] = useState('');
  const [signWorkstation, setSignWorkstation] = useState('');

  useEffect(() => {
    if (!notice) return;
    toast({ title: '本地保存失败', description: notice, status: 'error', duration: 6000 });
    setNotice(null);
  }, [notice, setNotice, toast]);

  const workstationOptions = useMemo(() => {
    const known = new Set(DEFAULT_WORKSTATIONS);
    history.forEach((task) => known.add(task.workstation));
    if (activeTask) known.add(activeTask.workstation);
    reviewLog.forEach((record) => known.add(record.workstation));
    held.forEach((record) => known.add(record.workstation));
    return [...known];
  }, [activeTask, history, reviewLog, held]);

  const pieces = useMemo(() => (activeTask ? taskPieces(activeTask) : []), [activeTask]);
  const signedByKey = useMemo(
    () => new Map((activeTask?.signoffs ?? []).map((record) => [record.pieceKey, record])),
    [activeTask],
  );
  const sheets = useMemo(() => {
    const groups = new Map<string, TaskPiece[]>();
    pieces.forEach((piece) => {
      const key = `${piece.placement.stockId}:${piece.placement.sheetIndex}`;
      groups.set(key, [...(groups.get(key) ?? []), piece]);
    });
    return [...groups.values()];
  }, [pieces]);

  const effectiveWorkstation = (signWorkstation.trim() || activeTask?.workstation) ?? '';
  const unreviewed = reviewLog.filter((record) => !record.reviewed);

  const sign = (targets: TaskPiece[]) => {
    if (!activeTask || targets.length === 0) return;
    const records = targets.map((piece) => buildSignoff(activeTask, piece, effectiveWorkstation));
    const outcome = dispatch({ type: 'sign', records });
    if (!outcome.persisted) return;
    if (outcome.accepted.length > 0) {
      toast({ title: `已签收 ${outcome.accepted.length} 件`, status: 'success', duration: 1800 });
    }
    if (outcome.held.length > 0) {
      toast({
        title: `${outcome.held.length} 件已被先前签收`,
        description: '后到提交已保留在现场暂存，未改写已签结果。',
        status: 'warning',
        duration: 3600,
      });
    }
  };

  const initiate = () => {
    const outcome = dispatch({ type: 'initiate', project, result, workstation: registerWorkstation });
    if (!outcome.persisted) return;
    toast({ title: '开料任务已发起', description: '排料版本与板材参数已冻结，零件按编号签收。', status: 'success' });
  };

  const complete = () => {
    const outcome = dispatch({ type: 'complete' });
    if (outcome.persisted) toast({ title: '任务已完成', description: '本任务将作为本地保存失败时的恢复点。', status: 'success' });
  };

  const replay = () => {
    const outcome = dispatch({ type: 'sign', records: replayQueue });
    if (!outcome.persisted) return;
    toast({
      title: `重放完成：入库 ${outcome.accepted.length} 条`,
      description: '重复记录已按编号跳过，不会重复入库。',
      status: outcome.accepted.length ? 'success' : 'info',
    });
  };

  return (
    <main className="page-shell">
      <Flex justify="space-between" align="end" mb="14px" gap="12px" wrap="wrap">
        <Box>
          <Text className="eyebrow">STEP 03 · 开料任务</Text>
          <Text className="page-title">开料签收与版本冻结</Text>
          <Text className="page-desc">
            发起任务即冻结当前排料版本并登记工位；每块零件按编号签收，同一任务重签只保留第一次及原工位。
          </Text>
        </Box>
        {activeTask && (
          <Button
            colorScheme="teal"
            leftIcon={<CheckCheck size={16} />}
            isDisabled={!progress || progress.pending > 0}
            onClick={complete}
          >
            完成任务
          </Button>
        )}
      </Flex>

      {replayQueue.length > 0 && (
        <Flex
          mb="14px"
          p="12px 14px"
          borderWidth="1px"
          borderColor="orange.300"
          borderRadius="10px"
          bg="orange.50"
          align="center"
          justify="space-between"
          gap="10px"
          wrap="wrap"
        >
          <HStack color="orange.800">
            <AlertTriangle size={16} />
            <Text fontSize="11px" fontWeight="700">{replayQueue.length} 条签收因保存失败待重放</Text>
          </HStack>
          <Button size="xs" colorScheme="orange" leftIcon={<RefreshCw size={13} />} onClick={replay}>重放</Button>
        </Flex>
      )}

      {activeTask && progress ? (
        <>
          <SimpleGrid columns={{ base: 2, lg: 4 }} spacing="10px" mb="14px">
            <Metric label="已切" value={`${progress.cut} 件`} accent="green" />
            <Metric label="待切" value={`${progress.pending} 件`} accent={progress.pending ? 'blue' : 'gray'} />
            <Metric label="差异（未排入）" value={`${progress.diff} 件`} accent={progress.diff ? 'red' : 'gray'} />
            <Metric label="交付需求" value={`${progress.required} 件`} accent="purple" />
          </SimpleGrid>
          <Box mb="14px" borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" p="12px 14px">
            <Flex justify="space-between" fontSize="10px" color="slate.500" mb="6px">
              <Text fontWeight="700">签收进度 {progress.cut}/{progress.placed}</Text>
              <Text>{activeTask.code} · 第 {activeTask.seq} 版 · 登记工位 {activeTask.workstation}</Text>
            </Flex>
            <Progress
              size="sm"
              colorScheme="teal"
              borderRadius="full"
              value={progress.placed ? (progress.cut / progress.placed) * 100 : 0}
            />
          </Box>
        </>
      ) : (
        <Box mb="14px" borderWidth="1px" borderColor="teal.200" borderRadius="10px" bg="teal.50" p="14px">
          <Grid templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) 260px' }} gap="14px" alignItems="end">
            <Box>
              <Text fontSize="13px" fontWeight="800" color="teal.900">当前没有进行中的开料任务</Text>
              <Text mt="5px" fontSize="11px" color="teal.800">
                将冻结当前排料：{result.sheetCount} 张板 · {result.placedParts}/{result.totalParts} 件 · 利用率{' '}
                {result.utilization.toFixed(1)}% · 锯缝 {project.kerf} mm · 修边 {project.trim} mm。
                {result.unplaced.length > 0 && ` 有 ${result.unplaced.length} 件未排入，将计入差异。`}
              </Text>
            </Box>
            <Stack spacing="8px">
              <FormControl>
                <FormLabel>登记工位</FormLabel>
                <Input
                  bg="white"
                  value={registerWorkstation}
                  onChange={(event) => setRegisterWorkstation(event.target.value)}
                  placeholder="如：开料一组"
                  list="workstation-options"
                />
              </FormControl>
              <Button colorScheme="teal" leftIcon={<Play size={15} />} onClick={initiate}>
                发起开料任务（冻结排料）
              </Button>
            </Stack>
          </Grid>
        </Box>
      )}

      <datalist id="workstation-options">
        {workstationOptions.map((name) => <option key={name} value={name} />)}
      </datalist>

      <Grid templateColumns={{ base: '1fr', xl: 'minmax(0, 1fr) 320px' }} gap="14px" alignItems="start">
        <Box>
          {activeTask && (
            <Box borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" overflow="hidden">
              <Flex p="13px" justify="space-between" align="center" borderBottomWidth="1px" gap="10px" wrap="wrap">
                <Box>
                  <Text fontSize="12px" fontWeight="800">签收清单 · {activeTask.code}</Text>
                  <Text fontSize="10px" color="slate.500">
                    冻结于 {formatTime(activeTask.createdAt)} · 尺寸以冻结版本为准，后续修改不影响本清单
                  </Text>
                </Box>
                <FormControl maxW="220px">
                  <FormLabel>签收工位</FormLabel>
                  <Input
                    size="sm"
                    value={signWorkstation}
                    onChange={(event) => setSignWorkstation(event.target.value)}
                    placeholder={activeTask.workstation}
                    list="workstation-options"
                  />
                </FormControl>
              </Flex>
              {sheets.map((sheetPieces) => {
                const first = sheetPieces[0];
                const signedCount = sheetPieces.filter((piece) => signedByKey.has(piece.key)).length;
                return (
                  <Box key={`${first.placement.stockId}-${first.placement.sheetIndex}`} borderBottomWidth="1px">
                    <Flex px="13px" py="9px" bg="slate.50" justify="space-between" align="center" gap="8px" wrap="wrap">
                      <HStack spacing="8px">
                        <Text fontSize="11px" fontWeight="800">
                          {first.stock?.name ?? first.placement.stockId} · 第 {first.placement.sheetIndex + 1} 张
                        </Text>
                        <Badge colorScheme={signedCount === sheetPieces.length ? 'green' : 'gray'}>
                          {signedCount}/{sheetPieces.length}
                        </Badge>
                      </HStack>
                      <Button
                        size="xs"
                        variant="outline"
                        colorScheme="teal"
                        leftIcon={<CheckCheck size={13} />}
                        isDisabled={signedCount === sheetPieces.length}
                        onClick={() => sign(sheetPieces)}
                      >
                        整板签收
                      </Button>
                    </Flex>
                    <TableContainer>
                      <Table size="sm">
                        <Thead>
                          <Tr>
                            <Th>编号</Th>
                            <Th>零件</Th>
                            <Th isNumeric>长</Th>
                            <Th isNumeric>宽</Th>
                            <Th isNumeric>厚</Th>
                            <Th>状态</Th>
                            <Th>签收</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {sheetPieces.map((piece) => {
                            const record = signedByKey.get(piece.key);
                            return (
                              <Tr key={piece.key}>
                                <Td><Text fontSize="10px" fontWeight="800">{activeTask.code}-{piece.no}</Text></Td>
                                <Td>
                                  <Text fontSize="11px" fontWeight="700">{piece.part?.name ?? piece.key}</Text>
                                  <Text fontSize="9px" color="slate.500">{piece.part?.kind}</Text>
                                </Td>
                                <Td isNumeric fontSize="10px">{piece.placement.width}</Td>
                                <Td isNumeric fontSize="10px">{piece.placement.height}</Td>
                                <Td isNumeric fontSize="10px">{piece.part?.thickness}</Td>
                                <Td>
                                  {record ? (
                                    <>
                                      <Badge colorScheme="green">已切</Badge>
                                      <Text fontSize="9px" color="slate.500" mt="2px">
                                        {record.workstation} · {formatTime(record.signedAt)}
                                      </Text>
                                    </>
                                  ) : (
                                    <Badge variant="outline">待切</Badge>
                                  )}
                                </Td>
                                <Td>
                                  {!record && (
                                    <Button size="xs" colorScheme="teal" variant="ghost" leftIcon={<Check size={13} />} onClick={() => sign([piece])}>
                                      签收
                                    </Button>
                                  )}
                                </Td>
                              </Tr>
                            );
                          })}
                        </Tbody>
                      </Table>
                    </TableContainer>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        <Stack spacing="12px">
          {activeTask && (
            <Box borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" p="14px">
              <Text fontSize="12px" fontWeight="800" mb="10px">任务信息</Text>
              <Stack spacing="7px" fontSize="11px">
                <HStack justify="space-between"><span>任务编号</span><b>{activeTask.code} · 第 {activeTask.seq} 版</b></HStack>
                <HStack justify="space-between"><span>登记工位</span><b>{activeTask.workstation}</b></HStack>
                <HStack justify="space-between"><span>发起时间</span><b>{formatTime(activeTask.createdAt)}</b></HStack>
                <HStack justify="space-between"><span>冻结参数</span><b>锯缝 {activeTask.snapshot.kerf} · 修边 {activeTask.snapshot.trim}</b></HStack>
              </Stack>
              <Text mt="10px" fontSize="10px" color="slate.500">
                零件尺寸或板材参数一旦变化，本任务未完成的签收立即失效，已切记录转入复核。
              </Text>
            </Box>
          )}

          {held.length > 0 && (
            <Box borderWidth="1px" borderColor="orange.200" borderRadius="10px" bg="white" p="14px">
              <Flex justify="space-between" align="center" mb="8px">
                <Text fontSize="12px" fontWeight="800">现场暂存（未入库）</Text>
                <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'clear-held' })}>清除</Button>
              </Flex>
              <Text fontSize="10px" color="slate.500" mb="8px">后到提交的现场值保留在此，不能改写已签结果。</Text>
              <Stack spacing="6px">
                {held.map((record) => (
                  <Flex key={record.id} justify="space-between" fontSize="10px" color="slate.600">
                    <Text>{record.pieceNo} · {record.partName}</Text>
                    <Text>{record.workstation} · {formatTime(record.signedAt)}</Text>
                  </Flex>
                ))}
              </Stack>
            </Box>
          )}

          <Box borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" p="14px">
            <Flex justify="space-between" align="center" mb="8px">
              <HStack><ClipboardCheck size={15} /><Text fontSize="12px" fontWeight="800">已切记录复核</Text></HStack>
              {unreviewed.length > 0 && (
                <Button size="xs" variant="outline" colorScheme="teal" onClick={() => dispatch({ type: 'review', ids: unreviewed.map((record) => record.id) })}>
                  全部确认
                </Button>
              )}
            </Flex>
            {reviewLog.length === 0 ? (
              <Text fontSize="10px" color="slate.500">暂无记录。尺寸变更前的已切记录会保留在此复核，不计入当前清单。</Text>
            ) : (
              <Stack spacing="8px">
                {reviewLog.map((record) => (
                  <Box key={record.id} borderWidth="1px" borderColor="slate.100" borderRadius="8px" p="8px">
                    <Flex justify="space-between" align="center" gap="8px">
                      <Text fontSize="10px" fontWeight="800">{record.taskCode}-{record.pieceNo} · {record.partName}</Text>
                      <Badge colorScheme={record.reviewed ? 'green' : 'orange'}>{record.reviewed ? '已复核' : '待复核'}</Badge>
                    </Flex>
                    <Text mt="3px" fontSize="9px" color="slate.500">
                      旧尺寸 {record.length}×{record.width}×{record.thickness} · {record.workstation} · {formatTime(record.signedAt)}
                    </Text>
                    {!record.reviewed && (
                      <Button mt="5px" size="xs" variant="ghost" colorScheme="teal" onClick={() => dispatch({ type: 'review', ids: [record.id] })}>
                        复核确认
                      </Button>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          <Box borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" p="14px">
            <HStack mb="8px"><History size={15} /><Text fontSize="12px" fontWeight="800">历史任务</Text></HStack>
            {history.length === 0 ? (
              <Text fontSize="10px" color="slate.500">暂无历史版本。</Text>
            ) : (
              <Stack spacing="7px">
                {history.map((task) => (
                  <Box key={task.id}>
                    <Flex justify="space-between" align="center">
                      <Text fontSize="11px" fontWeight="750">{task.code} · 第 {task.seq} 版</Text>
                      <Badge colorScheme={task.status === 'completed' ? 'green' : 'gray'}>
                        {task.status === 'completed' ? '已完成' : '已失效'}
                      </Badge>
                    </Flex>
                    <Text fontSize="9px" color="slate.500" mt="2px">
                      {task.workstation} · 签收 {task.signoffs.length} 件 · {formatTime(task.createdAt)}
                      {task.completedAt ? ` → ${formatTime(task.completedAt)}` : ''}
                    </Text>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Grid>
    </main>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Box borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" p="12px">
      <Text fontSize="9px" color="slate.500" textTransform="uppercase" letterSpacing=".06em" fontWeight="800">{label}</Text>
      <Text mt="5px" fontSize="20px" fontWeight="900" color={`${accent}.700`}>{value}</Text>
    </Box>
  );
}
