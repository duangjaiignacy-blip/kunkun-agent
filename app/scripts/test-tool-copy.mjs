import assert from 'node:assert/strict'
import { toolDoneLabel, toolLabel, toolMetaName } from '../src/lib/toolCopy.js'

const rocky = {
  prefix: 'Rocky',
  toolLabels: {
    read_file: '正在翻找书页…',
    write_file: '正在把结论缝进文件…',
  },
}

const lumo = {
  prefix: 'Lumo',
  toolLabels: {
    read_file: '正在点亮文件夹…',
    write_file: '正在用尾巴光线串起结论…',
  },
}

assert.equal(toolLabel(rocky, 'read_file'), '正在翻找书页…')
assert.equal(toolLabel(lumo, 'read_file'), '正在点亮文件夹…')
assert.equal(toolLabel(lumo, 'write_file'), '正在用尾巴光线串起结论…')
assert.equal(toolLabel(lumo, 'unknown_tool'), '正在使用 unknown_tool…')

assert.equal(toolDoneLabel(rocky, 'write_file'), '已把结论缝进文件')
assert.equal(toolDoneLabel(lumo, 'write_file'), '已用尾巴光线串起结论')
assert.equal(toolMetaName('look_image'), '看图')
assert.equal(toolMetaName('unknown_tool'), 'unknown_tool')

console.log('toolCopy tests passed')
