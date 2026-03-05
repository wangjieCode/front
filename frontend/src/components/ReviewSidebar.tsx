import React, { useMemo, useState } from 'react';
import { Alert, Button, Empty, Input, Modal, Segmented, Spin, Switch, Tag, Typography, message } from 'antd';
import { CloseOutlined, CodeOutlined, CopyOutlined, FileTextOutlined, ReloadOutlined, SearchOutlined, StepBackwardOutlined, StepForwardOutlined } from '@ant-design/icons';
import { ReviewFileDiff, ReviewFileItem } from '../types/conversation';
import { Diff, Hunk, parseDiff } from 'react-diff-view';

const { Text } = Typography;

interface ReviewSidebarProps {
  files: ReviewFileItem[];
  selectedFilePath?: string;
  selectedDiff: ReviewFileDiff | null;
  loadingFiles: boolean;
  loadingDiff: boolean;
  filesError?: string | null;
  diffError?: string | null;
  onSelectFile: (file: ReviewFileItem) => void;
  onRetryLoadFiles: () => void;
}

const getChangeTagColor = (changeType: ReviewFileItem['changeType']) => {
  if (changeType === 'added') return 'success';
  if (changeType === 'deleted') return 'error';
  return 'processing';
};

const ReviewSidebar: React.FC<ReviewSidebarProps> = ({
  files,
  selectedFilePath,
  selectedDiff,
  loadingFiles,
  loadingDiff,
  filesError,
  diffError,
  onSelectFile,
  onRetryLoadFiles,
}) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [activeModalFilePath, setActiveModalFilePath] = useState<string>('');
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [viewType, setViewType] = useState<'unified' | 'split'>('split');
  const [fontSize, setFontSize] = useState<'small' | 'middle'>('small');
  const [wrapLines, setWrapLines] = useState(true);
  const currentDiffFilePath = activeModalFilePath || selectedFilePath || '';

  const filteredFiles = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return files;
    return files.filter(file => file.filePath.toLowerCase().includes(q));
  }, [files, keyword]);

  const selectedIndex = useMemo(
    () => filteredFiles.findIndex(file => file.filePath === selectedFilePath),
    [filteredFiles, selectedFilePath]
  );

  const parsedDiffFiles = useMemo(() => {
    if (!selectedDiff?.diff || !currentDiffFilePath) {
      return [];
    }

    const rawDiff = selectedDiff.diff.trim();
    if (!rawDiff) {
      return [];
    }

    const normalized = rawDiff.startsWith('diff --git')
      ? rawDiff
      : [
          `diff --git a/${currentDiffFilePath} b/${currentDiffFilePath}`,
          `--- a/${currentDiffFilePath}`,
          `+++ b/${currentDiffFilePath}`,
          rawDiff,
        ].join('\n');

    try {
      return parseDiff(normalized);
    } catch (_error) {
      return [];
    }
  }, [selectedDiff?.diff, currentDiffFilePath]);

  const handleSelectByOffset = (offset: -1 | 1) => {
    if (filteredFiles.length === 0) return;
    const baseIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex = baseIndex + offset;
    if (nextIndex < 0 || nextIndex >= filteredFiles.length) return;
    onSelectFile(filteredFiles[nextIndex]);
  };

  const handleCopyDiff = async () => {
    if (!selectedDiff?.diff) return;
    try {
      await navigator.clipboard.writeText(selectedDiff.diff);
      message.success('已复制 diff');
    } catch (_error) {
      message.error('复制失败');
    }
  };

  const stats = useMemo(() => {
    return filteredFiles.reduce(
      (acc, file) => {
        acc.additions += file.additions || 0;
        acc.deletions += file.deletions || 0;
        return acc;
      },
      { additions: 0, deletions: 0 }
    );
  }, [filteredFiles]);

  const selectedFileOrderLabel = selectedIndex >= 0 ? `${selectedIndex + 1}/${filteredFiles.length}` : '-/-';

  const openFileDiffModal = (file: ReviewFileItem) => {
    setActiveModalFilePath(file.filePath);
    setDiffModalOpen(true);
    onSelectFile(file);
  };

  const hasActiveDiff = !!selectedDiff && selectedDiff.filePath === currentDiffFilePath;
  const modalLoading = loadingDiff && !!currentDiffFilePath;

  return (
    <>
    <div className="review-float-root">
      {panelOpen && (
        <div className="review-float-panel">
          <div className="review-float-panel-header">
            <div className="review-float-panel-title">
              <Text strong style={{ fontSize: 13 }}>变更文件</Text>
              {!loadingFiles && files.length > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {filteredFiles.length} 个 · <span style={{ color: '#52c41a' }}>+{stats.additions}</span> <span style={{ color: '#ff4d4f' }}>-{stats.deletions}</span>
                </Text>
              )}
            </div>
            <div className="review-float-panel-actions">
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={onRetryLoadFiles}
                loading={loadingFiles}
              />
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setPanelOpen(false)}
              />
            </div>
          </div>

          <div className="review-float-search">
            <Input
              size="small"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              allowClear
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="搜索文件路径"
              variant="borderless"
            />
          </div>

          {filesError && (
            <Alert
              type="error"
              message={filesError}
              showIcon
              style={{ margin: '0 10px 6px' }}
            />
          )}

          <div className="review-float-file-list">
            {loadingFiles ? (
              <div className="review-float-state">
                <Spin size="small" />
                <Text type="secondary" style={{ fontSize: 12 }}>加载中...</Text>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="review-float-state">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={files.length === 0 ? '暂无变更文件' : '未匹配到文件'} />
              </div>
            ) : (
              filteredFiles.map((file, index) => (
                <button
                  type="button"
                  key={file.filePath}
                  className={`review-float-file-item${selectedFilePath === file.filePath ? ' active' : ''}`}
                  onClick={() => openFileDiffModal(file)}
                >
                  <span className="review-float-file-index">{index + 1}</span>
                  <FileTextOutlined style={{ color: '#8c8c8c', flexShrink: 0 }} />
                  <span className="review-float-file-path" title={file.filePath}>{file.filePath}</span>
                  <Tag
                    color={getChangeTagColor(file.changeType)}
                    style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                  >
                    {file.changeType === 'added' ? 'A' : file.changeType === 'deleted' ? 'D' : 'M'}
                  </Tag>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className={`review-float-trigger${panelOpen ? ' active' : ''}`}
        onClick={() => setPanelOpen(!panelOpen)}
      >
        <CodeOutlined />
        {loadingFiles ? (
          <Spin size="small" />
        ) : (
          <span className="review-float-trigger-count">{files.length}</span>
        )}
        <span className="review-float-trigger-label">文件变更</span>
        {panelOpen && <CloseOutlined style={{ fontSize: 11, opacity: 0.7 }} />}
      </button>
    </div>
    <Modal
      open={diffModalOpen}
      onCancel={() => setDiffModalOpen(false)}
      footer={null}
      width="86vw"
      style={{ top: 20 }}
      destroyOnHidden
      title={currentDiffFilePath || '代码变更'}
    >
      <div className="review-diff-meta">
        <div className="review-diff-meta-main">
          <Text className="review-diff-meta-path" ellipsis={{ tooltip: currentDiffFilePath }}>
            {currentDiffFilePath || '-'}
          </Text>
          {hasActiveDiff && (
            <>
              <Tag color={getChangeTagColor(selectedDiff.changeType)}>{selectedDiff.changeType}</Tag>
              <Text type="success">+{selectedDiff.additions}</Text>
              <Text type="danger">-{selectedDiff.deletions}</Text>
            </>
          )}
        </div>
        <div className="review-diff-actions">
          <Button
            size="small"
            icon={<StepBackwardOutlined />}
            onClick={() => handleSelectByOffset(-1)}
            disabled={loadingFiles || filteredFiles.length === 0 || selectedIndex <= 0}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>{selectedFileOrderLabel}</Text>
          <Button
            size="small"
            icon={<StepForwardOutlined />}
            onClick={() => handleSelectByOffset(1)}
            disabled={loadingFiles || filteredFiles.length === 0 || selectedIndex < 0 || selectedIndex >= filteredFiles.length - 1}
          />
          <Switch
            size="small"
            checked={wrapLines}
            onChange={setWrapLines}
            checkedChildren="换行"
            unCheckedChildren="不换行"
          />
          <Segmented
            size="small"
            value={fontSize}
            onChange={(value) => setFontSize(value as 'small' | 'middle')}
            options={[
              { label: '小字', value: 'small' },
              { label: '中字', value: 'middle' },
            ]}
          />
          <Segmented
            size="small"
            value={viewType}
            onChange={(value) => setViewType(value as 'unified' | 'split')}
            options={[
              { label: 'Unified', value: 'unified' },
              { label: 'Split', value: 'split' },
            ]}
          />
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={handleCopyDiff}
            disabled={!hasActiveDiff || !selectedDiff?.diff}
          >
            复制
          </Button>
        </div>
      </div>

      {diffError && (
        <Alert
          type="warning"
          message={diffError}
          showIcon
          className="review-sidebar-alert"
        />
      )}

      {modalLoading ? (
        <div className="review-sidebar-loading">
          <Spin size="small" />
          <Text type="secondary">加载 diff 详情中...</Text>
        </div>
      ) : !hasActiveDiff ? (
        <div className="review-sidebar-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未获取到 diff 详情" />
        </div>
      ) : parsedDiffFiles.length === 0 ? (
        <pre className="review-diff-content">{selectedDiff.diff || '该文件暂无可展示 diff'}</pre>
      ) : (
        <div className={`review-diff-viewer font-${fontSize}${wrapLines ? ' wrap-on' : ' wrap-off'}`}>
          {parsedDiffFiles.map((file) => (
            <div key={`${file.oldPath}-${file.newPath}`} className="review-diff-file">
              <div className="review-diff-file-header">
                <div className="review-diff-file-header-main">
                  <Text className="review-diff-file-path">{file.newPath || file.oldPath || currentDiffFilePath}</Text>
                  {file.oldPath && file.newPath && file.oldPath !== file.newPath && (
                    <Text type="secondary" className="review-diff-file-rename">
                      {file.oldPath} → {file.newPath}
                    </Text>
                  )}
                </div>
                <div className="review-diff-file-header-right">
                  <Text type="success" className="review-diff-file-plus">+{selectedDiff.additions}</Text>
                  <Text type="danger" className="review-diff-file-minus">-{selectedDiff.deletions}</Text>
                  <Tag color={getChangeTagColor(selectedDiff.changeType)}>{selectedDiff.changeType}</Tag>
                </div>
              </div>
              <Diff
                viewType={viewType}
                diffType={file.type}
                hunks={file.hunks}
              >
                {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
              </Diff>
            </div>
          ))}
        </div>
      )}
    </Modal>
    </>
  );
};

export default ReviewSidebar;
