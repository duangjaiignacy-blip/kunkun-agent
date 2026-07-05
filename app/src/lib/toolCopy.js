export const DEFAULT_TOOL_LABELS = {
  look_image: '睁大眼睛看图中…',
  bash: '正在跑一条命令…',
  glob: '正在巡逻目录…',
  read_file: '正在翻找书页…',
  write_file: '正在把结论缝进文件…',
  edit_file: '正在细心改一处…',
  todo_write: '正在更新任务清单…',
  task: '派了个小分身去干活…',
  load_skill: '正在翻开技能书…',
  create_task: '正在把任务记进小本本…',
  list_tasks: '正在清点任务…',
  get_task: '正在查任务详情…',
  claim_task: '认领了一个任务…',
  complete_task: '正在给任务打勾…',
}

export const TOOL_CN = {
  look_image: '看图',
  bash: '执行命令',
  glob: '搜索文件',
  read_file: '读取文件',
  write_file: '写入文件',
  edit_file: '修改文件',
  todo_write: '更新清单',
  task: '分身任务',
  subagent: '分身任务',
  load_skill: '加载技能',
  create_task: '新建任务',
  list_tasks: '任务列表',
  get_task: '查看任务',
  claim_task: '认领任务',
  complete_task: '完成任务',
}

export function toolLabel(ipc, name) {
  return ipc?.toolLabels?.[name] || DEFAULT_TOOL_LABELS[name] || `正在使用 ${name}…`
}

export function toolDoneLabel(ipc, name) {
  const label = toolLabel(ipc, name)
  return label
    .replace('正在', '已')
    .replace('中…', '')
    .replace('…', '')
}

export function toolMetaName(name) {
  return TOOL_CN[name] || name
}
