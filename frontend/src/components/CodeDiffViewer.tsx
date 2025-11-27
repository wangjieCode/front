import React, { useState } from 'react';
import { Card, Collapse, Tag, Space, Empty, Button } from 'antd';
import { 
  FileAddOutlined, 
  FileTextOutlined, 
  DeleteOutlined,
  DownloadOutlined,
  ExpandOutlined,
  CompressOutlined
} from '@ant-design/icons';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer';
import { CodeChange, ChangeType } from '../types';

const { Panel } = Collapse;

interface CodeDiffViewerProps {
  changes: CodeChange[];
}

/**
 * 代码对比查看器组件
 * 展示代码变更的 diff 视图
 */
const CodeDiffViewer: React.FC<CodeDiffViewerProps> = ({ changes }) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // 获取变更类型图标
  const getChangeIcon = (changeType: ChangeType) => {
    switch (changeType) {
      case ChangeType.ADDED:
        return <FileAddOutlined style={{ color: '#52c41a' }} />;
      case ChangeType.MODIFIED:
        return <FileTextOutlined style={{ color: '#1890ff' }} />;
      case ChangeType.DELETED:
        return <DeleteOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return null;
    }
  };

  // 获取变更类型标签
  const getChangeTag = (changeType: ChangeType) => {
    const typeConfig = {
      [ChangeType.ADDED]: { color: 'success', text: '新增' },
      [ChangeType.MODIFIED]: { color: 'processing', text: '修改' },
      [ChangeType.DELETED]: { color: 'error', text: '删除' },
    };

    const config = typeConfig[changeType];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 解析 unified diff 格式
  const parseDiff = (diff: string) => {
    const lines = diff.split('\n');
    let oldContent = '';
    let newContent = '';
    
    for (const line of lines) {
      if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
        continue;
      }
      
      if (line.startsWith('-')) {
        oldContent += line.substring(1) + '\n';
      } else if (line.startsWith('+')) {
        newContent += line.substring(1) + '\n';
      } else {
        oldContent += line + '\n';
        newContent += line + '\n';
      }
    }
    
    return { oldContent, newContent };
  };

  // 展开/折叠所有
  const handleExpandAll = () => {
    if (expandedKeys.length === changes.length) {
      setExpandedKeys([]);
    } else {
      setExpandedKeys(changes.map((_, index) => index.toString()));
    }
  };

  // 下载代码变更
  const handleDownloadChanges = () => {
    const patchContent = changes
      .map(change => {
        return `diff --git a/${change.filePath} b/${change.filePath}\n${change.diff}`;
      })
      .join('\n\n');
    
    const blob = new Blob([patchContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-changes-${Date.now()}.patch`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (changes.length === 0) {
    return (
      <Card title="代码变更">
        <Empty 
          description="暂无代码变更"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  return (
    <Card 
      title={`代码变更 (${changes.length} 个文件)`}
      extra={
        <Space>
          <Button 
            size="small" 
            icon={expandedKeys.length === changes.length ? <CompressOutlined /> : <ExpandOutlined />}
            onClick={handleExpandAll}
          >
            {expandedKeys.length === changes.length ? '全部折叠' : '全部展开'}
          </Button>
          <Button 
            size="small" 
            icon={<DownloadOutlined />}
            onClick={handleDownloadChanges}
          >
            下载 Patch
          </Button>
        </Space>
      }
    >
      <Collapse 
        activeKey={expandedKeys}
        onChange={(keys) => setExpandedKeys(keys as string[])}
      >
        {changes.map((change, index) => {
          const { oldContent, newContent } = parseDiff(change.diff);
          
          return (
            <Panel
              key={index.toString()}
              header={
                <Space>
                  {getChangeIcon(change.changeType)}
                  {getChangeTag(change.changeType)}
                  <code style={{ fontSize: 13 }}>{change.filePath}</code>
                </Space>
              }
            >
              <div style={{ fontSize: 12 }}>
                <ReactDiffViewer
                  oldValue={oldContent}
                  newValue={newContent}
                  splitView={true}
                  compareMethod={DiffMethod.WORDS}
                  leftTitle="修改前"
                  rightTitle="修改后"
                  styles={{
                    variables: {
                      light: {
                        diffViewerBackground: '#fff',
                        addedBackground: '#e6ffed',
                        addedColor: '#24292e',
                        removedBackground: '#ffeef0',
                        removedColor: '#24292e',
                        wordAddedBackground: '#acf2bd',
                        wordRemovedBackground: '#fdb8c0',
                        addedGutterBackground: '#cdffd8',
                        removedGutterBackground: '#ffdce0',
                        gutterBackground: '#f6f8fa',
                        gutterBackgroundDark: '#f3f4f6',
                        highlightBackground: '#fffbdd',
                        highlightGutterBackground: '#fff5b1',
                      },
                    },
                    line: {
                      fontSize: '13px',
                      fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                    },
                  }}
                />
              </div>
            </Panel>
          );
        })}
      </Collapse>
    </Card>
  );
};

export default CodeDiffViewer;
