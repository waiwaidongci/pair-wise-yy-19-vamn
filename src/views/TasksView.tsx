import { useEffect, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  HStack,
  Input,
  NumberInput,
  NumberInputField,
  SimpleGrid,
  Stack,
  Switch,
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
import { CheckCircle2, History, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  activeTaskAtom,
  activeTaskProgressAtom,
  activeTaskStaleAtom,
  conflictNoticeAtom,
  cuttingTasksAtom,
  dismissNoticeAtom,
  ensureTaskAtom,
  initiateTaskAtom,
  recoverTasksAtom,
  recoverNoticeAtom,
  saveStatusAtom,
  signOffPartAtom,
  simulateFailureAtom,
} from '../stores/cuttingTask';
import { formatTaskTime, taskProgress } from '../utils/cuttingTask';
import type { CuttingTask } from '../types/woodworking';

export function TasksView() {
  const task = useAtomValue(activeTaskAtom);
  const progress = useAtomValue(activeTaskProgressAtom);
  const stale = useAtomValue(activeTaskStaleAtom);
  const saveStatus = useAtomValue(saveStatusAtom);
  const recoverNotice = useAtomValue(recoverNoticeAtom);
  const conflictNotice = useAtomValue(conflictNoticeAtom);
  const simulateFailure = useAtomValue(simulateFailureAtom);
  const tasksState = useAtomValue(cuttingTasksAtom);
  const ensureTask = useSetAtom(ensureTaskAtom);
  const initiateTask = useSetAtom(initiateTaskAtom);
  const recoverTasks = useSetAtom(recoverTasksAtom);
  const signOffPart = useSetAtom(signOffPartAtom);
  const setSimulateFailure = useSetAtom(simulateFailureAtom);
  const dismissNotice = useSetAtom(dismissNoticeAtom);
  const toast = useToast();

  const [workstation, setWorkstation] = useState('一工位');

  useEffect(() => {
    ensureTask();
  }, [ensureTask]);

  useEffect(() => {
    if (task?.workstation) setWorkstation(task.workstation);
  }, [task?.workstation]);

  useEffect(() => {
    if (conflictNotice) {
      toast({ title: '签收未覆盖', description: conflictNotice, status: 'warning', duration: 4000 });
      dismissNotice();
    }
  }, [conflictNotice, dismissNotice, toast]);

  const handleInitiate = () => {
    initiateTask(workstation);
    toast({ title: '开料任务已发起', description: '当前排料版本已冻结，可按编号签收。', status: 'success' });
  };

  const handleSignOff = (
    key: string,
    actuals: { length: number; width: number; thickness: number },
    note: string,
  ) => {
    signOffPart({
      key,
      workstation,
      actualLength: actuals.length,
      actualWidth: actuals.width,
      actualThickness: actuals.thickness,
      note,
    });
  };

  const historyTasks = Object.values(tasksState.tasks)
    .filter((item) => item.id !== task?.id)
    .sort((a, b) => b.version - a.version);

  return (
    <main className="page-shell">
      <Flex justify="space-between" align="end" mb="14px" gap="12px" wrap="wrap">
        <Box>
          <Text className="eyebrow">STEP 04 · 开料任务</Text>
          <Text className="page-title">排料冻结与签收</Text>
          <Text className="page-desc">发起时冻结排料版本并登记工位；每块零件按编号签收，重签只留第一次及原工位。</Text>
        </Box>
        <HStack>
          <HStack fontSize="10px" color={saveStatus === 'error' ? 'red.600' : 'green.700'}>
            <Save size={13} />
            <Text fontWeight="800">{saveStatus === 'error' ? '本地保存失败' : '已保存'}</Text>
          </HStack>
          <Button size="sm" variant="outline" leftIcon={<RotateCcw size={14} />} onClick={recoverTasks}>
            恢复最近任务
          </Button>
        </HStack>
      </Flex>

      {recoverNotice && (
        <Alert status="info" borderRadius="10px" mb="12px" variant="subtle">
          <AlertIcon />
          <Text fontSize="11px">{recoverNotice}</Text>
        </Alert>
      )}

      <Box borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" p="14px" mb="14px">
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr auto' }} gap="12px" alignItems="end">
          <FormControl>
            <FormLabel fontSize="10px">登记工位</FormLabel>
            <Input
              size="sm"
              value={workstation}
              onChange={(event) => setWorkstation(event.target.value)}
              placeholder="如：一工位"
            />
          </FormControl>
          <HStack pb="2px">
            <Switch
              isChecked={simulateFailure}
              onChange={(event) => setSimulateFailure(event.target.checked)}
            />
            <Text fontSize="10px" color="slate.500">模拟本地存储失败（验证恢复与重放）</Text>
          </HStack>
          <Button colorScheme="teal" leftIcon={<RefreshCw size={16} />} onClick={handleInitiate}>
            {task ? '冻结新版 · 发起任务' : '冻结排料 · 发起任务'}
          </Button>
        </Grid>
      </Box>

      {task && (
        <>
          <SimpleGrid columns={{ base: 2, lg: 5 }} spacing="10px" mb="14px">
            <Metric label="任务版本" value={`v${task.version}`} accent="teal" mono />
            <Metric label="已切" value={`${progress.cut}`} accent="green" />
            <Metric label="待切" value={`${progress.pending}`} accent="blue" />
            <Metric label="差异" value={`${progress.variance}`} accent={progress.variance ? 'orange' : 'gray'} />
            <Metric label="总件数" value={`${progress.total}`} accent="slate" />
          </SimpleGrid>

          {stale && (
            <Alert status="warning" borderRadius="10px" mb="12px" variant="subtle">
              <AlertIcon />
              <Text fontSize="11px">
                零件尺寸或板材参数已变更，未完成签收已失效；已切记录保留到复核，旧尺寸不会混入当前清单。请发起新版任务冻结当前排料。
              </Text>
            </Alert>
          )}

          <Box borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" overflow="hidden">
            <Flex p="13px" justify="space-between" align="center" borderBottomWidth="1px">
              <Box>
                <Text fontSize="12px" fontWeight="800">签收清单</Text>
                <Text fontSize="10px" color="slate.500">
                  {task.id} · 登记工位 {task.workstation} · 冻结于 {formatTaskTime(task.frozenAt)}
                </Text>
              </Box>
              <Badge colorScheme={stale ? 'orange' : 'teal'}>{stale ? '待复核' : '执行中'}</Badge>
            </Flex>
            <TableContainer maxH="560px" overflowY="auto">
              <Table size="sm">
                <Thead position="sticky" top="0" bg="slate.100" zIndex="1">
                  <Tr>
                    <Th>编号</Th>
                    <Th>零件</Th>
                    <Th>板材 / 位置</Th>
                    <Th isNumeric>名义尺寸</Th>
                    <Th isNumeric>实际尺寸(长×宽×厚)</Th>
                    <Th>状态</Th>
                    <Th />
                  </Tr>
                </Thead>
                <Tbody>
                  {task.placements.map((placement) => {
                    const record = task.signOffs[placement.key];
                    const isVariance = record ? progress.varianceKeys.includes(placement.key) : false;
                    return (
                      <SignOffRow
                        key={placement.key}
                        placement={placement}
                        record={record}
                        isVariance={isVariance}
                        disabled={stale}
                        onSignOff={handleSignOff}
                      />
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        </>
      )}

      {historyTasks.length > 0 && (
        <Box borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" p="14px" mt="14px">
          <HStack mb="10px">
            <History size={15} />
            <Text fontSize="12px" fontWeight="800">历史版本（已切记录保留复核）</Text>
          </HStack>
          <Stack spacing="8px">
            {historyTasks.map((item) => {
              const itemProgress = taskProgress(item);
              return (
                <Flex
                  key={item.id}
                  justify="space-between"
                  align="center"
                  borderWidth="1px"
                  borderColor="slate.100"
                  borderRadius="8px"
                  p="9px 12px"
                >
                  <Box>
                    <Text fontSize="11px" fontWeight="800">v{item.version} · {item.id}</Text>
                    <Text fontSize="10px" color="slate.500">
                      {item.workstation} · 冻结于 {formatTaskTime(item.frozenAt)} · 已切 {itemProgress.cut}/{itemProgress.total}
                    </Text>
                  </Box>
                  <Badge colorScheme={item.status === 'review' ? 'orange' : 'gray'}>
                    {item.status === 'review' ? '复核中' : '已关闭'}
                  </Badge>
                </Flex>
              );
            })}
          </Stack>
        </Box>
      )}
    </main>
  );
}

function SignOffRow({
  placement,
  record,
  isVariance,
  disabled,
  onSignOff,
}: {
  placement: CuttingTask['placements'][number];
  record: CuttingTask['signOffs'][string] | undefined;
  isVariance: boolean;
  disabled: boolean;
  onSignOff: (
    key: string,
    actuals: { length: number; width: number; thickness: number },
    note: string,
  ) => void;
}) {
  const [length, setLength] = useState(placement.nominalLength);
  const [width, setWidth] = useState(placement.nominalWidth);
  const [thickness, setThickness] = useState(placement.nominalThickness);
  const [note, setNote] = useState('');

  return (
    <Tr opacity={record ? 0.92 : 1}>
      <Td>
        <Text fontSize="10px" fontFamily="mono" fontWeight="700">{placement.key}</Text>
      </Td>
      <Td>
        <Text fontSize="11px" fontWeight="750">{placement.partName}</Text>
        <Text fontSize="9px" color="slate.500">#{placement.instance + 1}</Text>
      </Td>
      <Td>
        <Text fontSize="10px">{placement.stockName}</Text>
        <Text fontSize="9px" color="slate.500">
          第 {placement.sheetIndex + 1} 张 · ({Math.round(placement.x)},{Math.round(placement.y)})
        </Text>
      </Td>
      <Td isNumeric fontSize="10px">
        {placement.nominalLength}×{placement.nominalWidth}×{placement.nominalThickness}
      </Td>
      <Td>
        {record ? (
          <Text fontSize="10px">
            {record.actualLength ?? placement.nominalLength}×
            {record.actualWidth ?? placement.nominalWidth}×
            {record.actualThickness ?? placement.nominalThickness}
          </Text>
        ) : (
          <HStack spacing="4px">
            <NumberInput size="xs" w="64px" value={length} onChange={(_, v) => setLength(v || 0)}>
              <NumberInputField px="4px" />
            </NumberInput>
            <Text fontSize="9px" color="slate.400">×</Text>
            <NumberInput size="xs" w="64px" value={width} onChange={(_, v) => setWidth(v || 0)}>
              <NumberInputField px="4px" />
            </NumberInput>
            <Text fontSize="9px" color="slate.400">×</Text>
            <NumberInput size="xs" w="56px" value={thickness} onChange={(_, v) => setThickness(v || 0)}>
              <NumberInputField px="4px" />
            </NumberInput>
          </HStack>
        )}
      </Td>
      <Td>
        {record ? (
          <HStack spacing="4px" flexWrap="wrap">
            <Badge colorScheme="green" fontSize="9px">已切</Badge>
            {isVariance && <Badge colorScheme="orange" fontSize="9px">差异</Badge>}
            {record.contested && <Badge colorScheme="purple" fontSize="9px">有争议</Badge>}
            <Text fontSize="9px" color="slate.500">
              {record.workstation} · {formatTaskTime(record.signedAt)}
            </Text>
          </HStack>
        ) : (
          <Badge colorScheme="blue" fontSize="9px">待切</Badge>
        )}
      </Td>
      <Td>
        {!record && (
          <HStack spacing="4px">
            <Input
              size="xs"
              w="90px"
              placeholder="备注"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Button
              size="xs"
              colorScheme="teal"
              leftIcon={<CheckCircle2 size={12} />}
              isDisabled={disabled}
              onClick={() => onSignOff(placement.key, { length, width, thickness }, note)}
            >
              签收
            </Button>
          </HStack>
        )}
      </Td>
    </Tr>
  );
}

function Metric({ label, value, accent, mono }: { label: string; value: string; accent: string; mono?: boolean }) {
  return (
    <Box borderWidth="1px" borderColor="slate.200" borderRadius="10px" bg="white" p="12px">
      <Text fontSize="9px" color="slate.500" textTransform="uppercase" letterSpacing=".06em" fontWeight="800">
        {label}
      </Text>
      <Text
        mt="5px"
        fontSize="20px"
        fontWeight="900"
        fontFamily={mono ? 'mono' : undefined}
        color={`${accent}.700`}
      >
        {value}
      </Text>
    </Box>
  );
}
