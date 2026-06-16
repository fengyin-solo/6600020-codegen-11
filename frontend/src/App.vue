<template>
  <div class="flex h-screen">
    <!-- Sidebar -->
    <div class="w-72 bg-gray-900 p-4 flex flex-col gap-3 border-r border-gray-800 overflow-y-auto">
      <h1 class="text-lg font-bold text-orange-400">Modbus 工业监控</h1>
      <div class="flex gap-2">
        <button @click="startPoll" :disabled="store.isPolling" class="flex-1 bg-green-700 py-1.5 rounded text-xs hover:bg-green-600 disabled:opacity-50">
          {{ store.isPolling ? '采集中...' : '开始采集' }}
        </button>
        <button @click="stopPoll" :disabled="!store.isPolling" class="flex-1 bg-red-700 py-1.5 rounded text-xs hover:bg-red-600 disabled:opacity-50">
          停止
        </button>
      </div>
      <div>
        <label class="text-gray-400 text-xs">轮询间隔: {{ store.pollInterval }}ms</label>
        <input type="range" v-model.number="store.pollInterval" min="200" max="5000" step="100" class="w-full" />
      </div>

      <div class="bg-gray-800 rounded p-2 text-xs">
        <div class="flex items-center justify-between mb-1">
          <span class="text-gray-400">多条件联动</span>
          <label class="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" v-model="store.alarmConfig.requireDeviceOnline" class="accent-orange-500" />
            <span class="text-green-400">设备在线</span>
          </label>
        </div>
        <div class="text-gray-500">
          需同时满足：连续超限 ≥ N次 + 设备在线 → 升级严重告警
        </div>
      </div>

      <div class="flex gap-2">
        <button @click="store.acknowledgeAllAlarms()" class="flex-1 bg-blue-700 py-1 rounded text-xs hover:bg-blue-600">全部确认</button>
        <button @click="store.clearAlarms()" class="flex-1 bg-gray-700 py-1 rounded text-xs hover:bg-gray-600">清空告警</button>
      </div>

      <h3 class="text-gray-400 text-xs mt-2">设备列表</h3>
      <div v-for="d in store.devices" :key="d.id" @click="store.selectedDevice = d"
        class="bg-gray-800 rounded p-2 cursor-pointer text-sm"
        :class="store.selectedDevice?.id === d.id ? 'ring-1 ring-orange-500' : ''">
        <div class="flex justify-between">
          <span>{{ d.name }}</span>
          <div class="flex items-center gap-1">
            <button @click.stop="store.toggleDevice(d.id)" class="text-xs px-1.5 py-0.5 rounded" :class="d.online ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'">
              {{ d.online ? '在线' : '离线' }}
            </button>
          </div>
        </div>
        <div class="text-xs text-gray-500 mt-1">{{ d.ip }}:{{ d.port }} [{{ d.slaveId }}]</div>
      </div>

      <div v-if="store.criticalAlarms.length" class="bg-red-900/50 rounded p-2 mt-2">
        <h4 class="text-red-400 text-xs font-bold">⚠ 严重告警 {{ store.criticalAlarms.length }}</h4>
        <div v-for="a in store.criticalAlarms.slice(0, 3)" :key="a.id" class="text-xs text-red-300 mt-1 truncate">
          {{ a.message }}
        </div>
      </div>

      <div v-if="store.escalatedAlarms.length" class="bg-orange-900/40 rounded p-2 mt-2">
        <h4 class="text-orange-400 text-xs font-bold">⚡ 联动升级告警 {{ store.escalatedAlarms.length }}</h4>
        <div v-for="a in store.escalatedAlarms.slice(0, 3)" :key="a.id" class="text-xs text-orange-300 mt-1 truncate">
          {{ a.message }}
        </div>
      </div>

      <div class="text-xs text-gray-600 mt-auto">
        在线: {{ store.onlineDevices.length }}/{{ store.devices.length }}
      </div>
    </div>

    <!-- Main Dashboard -->
    <div class="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
      <!-- Top Row: Alarm Config + Debug -->
      <div class="grid grid-cols-3 gap-3">
        <div class="col-span-2 bg-gray-900 rounded-xl p-3">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm text-gray-400">多条件告警阈值配置</h3>
            <span class="text-xs text-gray-500">连续超限次数 + 设备在线 → 升级为严重告警</span>
          </div>
          <div class="grid grid-cols-5 gap-2">
            <div v-for="t in store.alarmConfig.thresholds" :key="t.registerName" class="bg-gray-800 rounded p-2">
              <div class="text-xs font-bold text-orange-400 mb-1">{{ t.registerName }}</div>
              <div class="space-y-1">
                <div class="flex justify-between text-xs">
                  <span class="text-yellow-400">警告阈值</span>
                  <input type="number" v-model.number="t.warningThreshold" step="0.1" class="w-16 bg-gray-900 rounded px-1 text-right text-xs border border-gray-700 focus:border-yellow-500 outline-none" />
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-red-400">严重阈值</span>
                  <input type="number" v-model.number="t.criticalThreshold" step="0.1" class="w-16 bg-gray-900 rounded px-1 text-right text-xs border border-gray-700 focus:border-red-500 outline-none" />
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-blue-400">连续次数</span>
                  <input type="number" v-model.number="t.consecutiveCount" min="1" max="20" class="w-16 bg-gray-900 rounded px-1 text-right text-xs border border-gray-700 focus:border-blue-500 outline-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-gray-900 rounded-xl p-3">
          <h3 class="text-sm text-gray-400 mb-2">模拟超限调试</h3>
          <div class="space-y-2">
            <div>
              <label class="text-xs text-gray-500">设备</label>
              <select v-model="debugDeviceId" class="w-full bg-gray-800 rounded px-2 py-1 text-xs border border-gray-700 mt-1">
                <option v-for="d in store.devices" :key="d.id" :value="d.id">{{ d.name }} [{{ d.online ? '在线' : '离线' }}]</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-500">寄存器</label>
              <select v-model="debugRegisterName" class="w-full bg-gray-800 rounded px-2 py-1 text-xs border border-gray-700 mt-1">
                <option v-for="r in debugDevice?.registers.filter(r => typeof r.value === 'number')" :key="r.address" :value="r.name">{{ r.name }} ({{ r.unit }})</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-500">目标值</label>
              <input type="number" v-model.number="debugTargetValue" step="0.1" class="w-full bg-gray-800 rounded px-2 py-1 text-xs border border-gray-700 mt-1" />
            </div>
            <div>
              <label class="text-xs text-gray-500">触发次数</label>
              <input type="number" v-model.number="debugTriggerCount" min="1" max="20" class="w-full bg-gray-800 rounded px-2 py-1 text-xs border border-gray-700 mt-1" />
            </div>
            <div class="flex gap-1 pt-1">
              <button @click="triggerSpike" class="flex-1 bg-orange-700 py-1.5 rounded text-xs hover:bg-orange-600">触发超限</button>
              <button @click="resetDebugValue" class="flex-1 bg-gray-700 py-1.5 rounded text-xs hover:bg-gray-600">重置</button>
            </div>
            <div v-if="debugThreshold" class="bg-gray-800 rounded p-2 text-xs mt-2">
              <div class="text-gray-500">当前阈值配置:</div>
              <div>警告: <span class="text-yellow-400">{{ debugThreshold.warningThreshold }}</span> | 严重: <span class="text-red-400">{{ debugThreshold.criticalThreshold }}</span> | 连续: <span class="text-blue-400">{{ debugThreshold.consecutiveCount }}次</span></div>
              <div v-if="currentTracker" class="mt-1 text-gray-400">
                当前连续超限: <span class="text-orange-400 font-bold">{{ currentTracker.count }}次</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Register Gauges -->
      <div class="bg-gray-900 rounded-xl p-3">
        <h3 class="text-sm text-gray-400 mb-2">实时数据</h3>
        <div class="grid grid-cols-5 gap-3">
          <template v-for="d in store.devices" :key="d.id">
            <div v-for="r in d.registers" :key="`${d.id}_${r.address}`" class="rounded-xl p-3" :class="getGaugeBgClass(d, r)">
              <div class="text-xs text-gray-400 truncate">{{ d.name }}</div>
              <div class="text-2xl font-bold mt-1" :class="getGaugeValueClass(d, r)">
                {{ typeof r.value === 'number' ? r.value.toFixed(r.value > 100 ? 0 : 1) : r.value ? 'ON' : 'OFF' }}
                <span v-if="getTrackerStatus(d.id, r.name).count > 0" class="text-xs align-top ml-1" :class="getTrackerStatus(d.id, r.name).count >= 3 ? 'text-red-400' : 'text-yellow-400'">
                  ×{{ getTrackerStatus(d.id, r.name).count }}
                </span>
              </div>
              <div class="text-xs text-gray-500">{{ r.name }} {{ r.unit }}</div>
              <div v-if="getGaugeStatus(d, r) !== 'normal'" class="text-xs mt-1" :class="getGaugeStatus(d, r) === 'escalated' ? 'text-red-500' : 'text-yellow-500'">
                {{ getGaugeStatus(d, r) === 'escalated' ? '🚨 严重告警' : '⚠ 警告' }}
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Chart -->
      <div class="bg-gray-900 rounded-xl p-3 flex-1">
        <h3 class="text-sm text-gray-400 mb-2">
          实时趋势 — {{ store.selectedDevice?.name || '选择设备' }}
        </h3>
        <TrendChart />
      </div>

      <!-- Alarm List -->
      <div class="bg-gray-900 rounded-xl p-3 max-h-64 overflow-y-auto">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm text-gray-400">告警记录 <span class="text-gray-600">({{ store.alarms.length }})</span></h3>
          <div class="flex gap-2 text-xs">
            <span class="px-2 py-0.5 rounded bg-red-900/40 text-red-400">严重: {{ store.criticalAlarms.length }}</span>
            <span class="px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400">警告: {{ store.warningAlarms.length }}</span>
            <span class="px-2 py-0.5 rounded bg-orange-900/40 text-orange-400">联动升级: {{ store.escalatedAlarms.length }}</span>
          </div>
        </div>
        <div v-for="a in store.alarms.slice(0, 20)" :key="a.id"
          class="flex justify-between items-center text-xs rounded p-2 mb-1"
          :class="getAlarmRowClass(a)">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span v-if="a.escalated" class="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px]">⚡ 联动升级</span>
              <span :class="a.level === 'critical' ? 'text-red-400 font-bold' : 'text-yellow-400'">{{ a.message }}</span>
            </div>
            <div v-if="a.consecutiveCount" class="text-[10px] text-gray-500 mt-0.5">
              连续超限 {{ a.consecutiveCount }} 次
            </div>
          </div>
          <div class="flex gap-2 items-center ml-2 flex-shrink-0">
            <span class="text-gray-500">{{ new Date(a.timestamp).toLocaleTimeString() }}</span>
            <button v-if="!a.acknowledged" @click="store.acknowledgeAlarm(a.id)" class="text-blue-400 hover:underline whitespace-nowrap">确认</button>
            <span v-else class="text-gray-600">已确认</span>
          </div>
        </div>
        <div v-if="!store.alarms.length" class="text-center text-gray-600 text-xs py-8">暂无告警记录</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useModbusStore } from './store/modbus'
import TrendChart from './components/TrendChart.vue'
import type { Alarm, ModbusRegister, Device } from './types'

const store = useModbusStore()
let timer: number | null = null

const debugDeviceId = ref('dev1')
const debugRegisterName = ref('温度')
const debugTargetValue = ref(31.0)
const debugTriggerCount = ref(5)

const debugDevice = computed(() => store.devices.find(d => d.id === debugDeviceId.value))

const debugThreshold = computed(() => store.getThreshold(debugRegisterName.value))

const currentTracker = computed(() => {
  const key = `${debugDeviceId.value}_${debugRegisterName.value}`
  return store.consecutiveExceedTracker[key]
})

watch(debugDeviceId, () => {
  if (debugDevice.value && debugDevice.value.registers.length > 0) {
    const numReg = debugDevice.value.registers.find(r => typeof r.value === 'number')
    if (numReg) debugRegisterName.value = numReg.name
  }
})

function getTrackerStatus(deviceId: string, registerName: string) {
  const key = `${deviceId}_${registerName}`
  return store.consecutiveExceedTracker[key] || { count: 0 }
}

function getGaugeStatus(d: Device, r: ModbusRegister): 'normal' | 'warning' | 'escalated' {
  if (typeof r.value !== 'number') return 'normal'
  const status = getTrackerStatus(d.id, r.name)
  const threshold = store.getThreshold(r.name)
  if (!threshold) return 'normal'
  if (r.value > threshold.criticalThreshold && status.count >= threshold.consecutiveCount && d.online) return 'escalated'
  if (r.value > threshold.warningThreshold) return 'warning'
  return 'normal'
}

function getGaugeBgClass(d: Device, r: ModbusRegister) {
  const status = getGaugeStatus(d, r)
  if (status === 'escalated') return 'bg-red-900/40 border border-red-700'
  if (status === 'warning') return 'bg-yellow-900/20 border border-yellow-800'
  return 'bg-gray-800'
}

function getGaugeValueClass(d: Device, r: ModbusRegister) {
  if (!d.online) return 'text-gray-600'
  const status = getGaugeStatus(d, r)
  if (status === 'escalated') return 'text-red-400'
  if (status === 'warning') return 'text-yellow-400'
  return 'text-orange-400'
}

function getAlarmRowClass(a: Alarm) {
  const base = 'bg-gray-800 border-l-4'
  if (a.escalated) return `${base} border-red-500 bg-red-900/20`
  if (a.level === 'critical') return `${base} border-red-500`
  return `${base} border-yellow-500`
}

function startPoll() {
  store.isPolling = true
  timer = window.setInterval(() => store.simulatePoll(), store.pollInterval)
}

function stopPoll() {
  store.isPolling = false
  if (timer) { clearInterval(timer); timer = null }
}

function triggerSpike() {
  store.simulateSpike(debugDeviceId.value, debugRegisterName.value, debugTargetValue.value, debugTriggerCount.value)
}

function resetDebugValue() {
  const dev = store.devices.find(d => d.id === debugDeviceId.value)
  if (!dev) return
  const reg = dev.registers.find(r => r.name === debugRegisterName.value)
  if (!reg || typeof reg.value !== 'number') return
  const threshold = store.getThreshold(debugRegisterName.value)
  if (threshold) {
    reg.value = Math.round((threshold.warningThreshold - Math.random() * threshold.warningThreshold * 0.2) * 100) / 100
  }
  reg.updatedAt = Date.now()
  const key = `${dev.id}_${debugRegisterName.value}`
  if (store.consecutiveExceedTracker[key]) {
    delete store.consecutiveExceedTracker[key]
  }
}

onMounted(() => store.initMockDevices())
onUnmounted(() => stopPoll())
</script>
