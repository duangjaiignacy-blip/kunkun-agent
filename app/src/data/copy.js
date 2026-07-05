// 文案与姿态资产映射 —— 规范：docs/DESIGN.md §3.2 + docs/方案B-真实翼蜥Lumo-演示方案.md
// 双 IP 架构：方案A 石虎 Rocky（暖调/月洞窗/文化治愈）× 方案B 翼蜥 Lumo（冷调/灵感光点/写实萌宠）

// ── 方案A 石虎资产 ──
import poseWave from '../assets/ip/pose-wave.png'
import poseSit from '../assets/ip/pose-sit.png'
import poseSearch from '../assets/ip/pose-search.png'
import poseYarn from '../assets/ip/pose-yarn.png'
import poseBook from '../assets/ip/pose-book.png'
import poseFront from '../assets/ip/pose-front.png'
import poseJump from '../assets/ip/pose-jump.png'
import headImg from '../assets/ip/head.png'
// 透明底（rembg）：桌宠用
import alphaSit from '../assets/ip/pose-sit-alpha.png'
import blankSit from '../assets/ip/pose-sit-blank.png' // 无眼底图：CSS 眼睛是唯一的眼睛
import alphaWave from '../assets/ip/pose-wave-alpha.png'
import alphaYarn from '../assets/ip/pose-yarn-alpha.png'
import alphaJump from '../assets/ip/pose-jump-alpha.png'
import alphaSearch from '../assets/ip/pose-search-alpha.png'
import alphaBook from '../assets/ip/pose-book-alpha.png'

// ── 方案B 翼蜥资产（全部透明底）──
import bHero from '../assets/ip/b-hero-alpha.png'
import bPanel from '../assets/ip/b-panel-alpha.png'
import bCard from '../assets/ip/b-card-alpha.png'
import bFolder from '../assets/ip/b-folder-alpha.png'
import bOrb from '../assets/ip/b-orb-alpha.png'
import bJump from '../assets/ip/b-jump-alpha.png'
import bHead from '../assets/ip/b-head-alpha.png'

// 姿态注册表：Porthole / DeskPet 统一按名字取图
export const POSE = {
  // A · 原图（面板月洞窗用，含奶油底）
  wave: poseWave, sit: poseSit, search: poseSearch, yarn: poseYarn,
  book: poseBook, front: poseFront, jump: poseJump, head: headImg,
  // A · 透明底（桌宠用）
  'sit-alpha': alphaSit, 'sit-blank': blankSit, 'wave-alpha': alphaWave,
  'yarn-alpha': alphaYarn, 'jump-alpha': alphaJump,
  'search-alpha': alphaSearch, 'book-alpha': alphaBook,
  // B · 透明底
  'b-hero': bHero, 'b-panel': bPanel, 'b-card': bCard,
  'b-folder': bFolder, 'b-orb': bOrb, 'b-jump': bJump, 'b-head': bHead,
}

// 工具调用阶段（IP 无关的语义时间轴；姿态由 IP_CONFIG.panelPose[key] 解析）
export const TOOL_PHASES = [
  { key: 'think', menubar: 'think', label: '正在整理线索…', meta: 'planning · 拆解任务', dur: 2100 },
  { key: 'look', menubar: 'look', label: '睁大眼睛看图中…', meta: 'look_image · ~/Desktop/error.png', glow: true, dur: 2400 },
  { key: 'read', menubar: 'search', label: '正在翻找书页…', meta: 'read_file · agent.py', dur: 2100 },
  { key: 'write', menubar: 'think', label: '正在把灵感缝进文件…', meta: 'write_file · 报错分析.md', dur: 2200 },
]

export const DONE_META = '✓ 4 个步骤全部完成'

export const MENUBAR_STATES = [
  { key: 'idle', name: '待命' },
  { key: 'think', name: '思考中' },
  { key: 'look', name: '正在看图' },
  { key: 'search', name: '正在找文件' },
  { key: 'done', name: '任务完成' },
  { key: 'error', name: '出错/未启动' },
]

// ═══ 双 IP 配置 ═══════════════════════════════════════════

export const IP_CONFIG = {
  tiger: {
    key: 'tiger',
    label: '🐯 方案A 石虎',
    name: 'Rocky',
    role: '数字记忆守护',
    osLabel: 'Rocky OS',
    theme: '', // 默认暖调皮肤
    petSize: 122,
    // 桌宠姿态（透明底）
    petPose: {
      idle: 'sit-blank', think: 'yarn-alpha', look: 'search-alpha',
      search: 'book-alpha', done: 'jump-alpha', error: 'sit-alpha', greet: 'wave-alpha',
    },
    // 面板内姿态（月洞窗）：工具阶段 key → 姿态
    panelPose: { think: 'yarn', look: 'front', read: 'book', write: 'yarn', done: 'jump', error: 'sit' },
    avatar: 'head',
    hero: 'wave',
    lookFocus: '50% 16%', // 看图姿态的取景焦点（对准脸）
    // CSS 可动眼睛（几何程序实测于 pose-sit）
    eyes: [
      { left: '36.8%', top: '28.0%' },
      { left: '61.8%', top: '28.6%' },
    ],
    bubbles: {
      idle: ['有事叫我～', '今天也要好好保存。', 'zZ…', '想法冒头了吗？'],
      think: '等我缝一下线索…',
      look: '我看到啦！',
      search: '让我翻翻。',
      done: '完成，收工！',
      error: '这条线索断了，再来一次。',
      greet: '你来啦！',
    },
    nagHungry: '肚子咕咕叫了…想吃小团子 🍡',
    nagDirty: '毛有点乱，想洗香香～',
    feed: { emoji: '🍡', text: '咔嚓咔嚓…真好吃！' },
    bath: { text: '洗香香～亮晶晶！✨' },
    greetings: ['今天要守住哪个灵感？', '把乱糟糟的信息交给我。', '我在菜单栏待命，有事叫我。'],
    intro: '我是 Rocky，从天一阁醒来，替你守住数字记忆。',
    toolIntro: '交给我守住。我先看图，再对照代码，最后把结论缝进笔记：',
    doneLabel: 'Rocky 已经守好了。',
    prefix: 'Rocky',
  },

  lizard: {
    key: 'lizard',
    label: '🦎 方案B 翼蜥',
    name: 'Lumo',
    role: '灵感观察助手',
    osLabel: 'Lumo OS',
    theme: 'theme-lizard', // 冷调玻璃皮肤
    petSize: 138,
    petPose: {
      idle: 'b-orb', think: 'b-panel', look: 'b-card',
      search: 'b-folder', done: 'b-jump', error: 'b-orb', greet: 'b-hero',
    },
    panelPose: { think: 'b-panel', look: 'b-card', read: 'b-folder', write: 'b-orb', done: 'b-jump', error: 'b-orb' },
    avatar: 'b-head',
    hero: 'b-hero',
    lookFocus: '38% 40%',
    eyes: null, // 快速版：写实玻璃眼不做 CSS 重建（降级为整头跟随），完整版待办
    bubbles: {
      idle: ['我在盯着呢～', '这条线索亮了。', '守住这个灵感。', 'zZ…'],
      think: '等我把线索串起来…',
      look: '我看到了！放大看看…',
      search: '翻翻这些文件夹。',
      done: '完成，尾巴都亮了！',
      error: '这条线索断了…再来一次。',
      greet: '你来啦！',
    },
    nagHungry: '有点饿了…想吃一颗光点 ✨',
    nagDirty: '鳞片蒙灰了，想冲个凉～',
    feed: { emoji: '✨', text: '咔——灵感光点，收下了！' },
    bath: { text: '冲个凉，鳞片亮晶晶！' },
    greetings: ['今天要抓住哪道灵感？', '把线索丢给我盯着。', '我在屏幕边上守着呢。'],
    intro: '我是 Lumo，从屏幕缝隙里孵出来，替你盯住每条线索。',
    toolIntro: '我盯到了。先看图，再翻文件，最后把线索串起来：',
    doneLabel: 'Lumo 搞定了，尾巴都亮了！',
    prefix: 'Lumo',
  },
}

// 组件总览页（沿用方案A 展示，B 版总览列入完整版待办）
export const POSE_CARDS = [
  { pose: 'sit', state: '待命', copy: '呼吸微动，随时被召唤', anim: 'breathe' },
  { pose: 'yarn', state: '思考中', copy: 'Rocky 正在整理线索…' },
  { pose: 'book', state: '读取文件', copy: 'Rocky 正在翻找书页…' },
  { pose: 'search', state: '搜索目录', copy: 'Rocky 正在巡逻目录…' },
  { pose: 'front', state: '分析图片', copy: 'Rocky 睁大眼睛看图中…', glow: true, focus: '50% 16%' },
  { pose: 'yarn', state: '写入文件', copy: 'Rocky 正在把灵感缝进文件…' },
  { pose: 'jump', state: '任务完成', copy: 'Rocky 已经守好了。' },
  { pose: 'sit', state: '出错', copy: '没抓稳这条线索，再试一次', muted: true },
]

export const GREETINGS = IP_CONFIG.tiger.greetings

export const TOKENS = [
  { name: '--ink 墨黑', val: '#2E2E29' },
  { name: '--sage 石虎灰绿', val: '#8E9880' },
  { name: '--sage-deep 深橄榄纹', val: '#57624A' },
  { name: '--cream 奶油', val: '#F5EFE2' },
  { name: '--paper 浅米白', val: '#FAF7F0' },
  { name: '--gold 古金', val: '#B98A48' },
  { name: '--gold-soft 浅金', val: '#D8BC8A' },
  { name: '--silver 浅银', val: '#D9D6CC' },
  { name: '--lilac AI 点缀紫', val: '#A99BDD' },
  { name: '--blush 爪垫粉', val: '#E9BBAD' },
]
