import React, { useState, useEffect } from 'react';
import { Select, Spin, message } from 'antd';
import { ProjectOutlined } from '@ant-design/icons';
import { projectService } from '../services/projectService';
import { Project } from '../types/project';

const { Option } = Select;
interface ProjectSelectorProps {
  value?: string;
  onChange?: (projectId: string, project: Project) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MobileProjectSelector: React.FC<ProjectSelectorProps> = ({
  value,
  onChange,
  placeholder = '请选择项目',
  disabled = false,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载项目列表
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        const response = await projectService.getProjects();
        
        if (response.success && response.data) {
          setProjects(response.data);
        } else {
          message.error('加载项目列表失败');
        }
      } catch (error) {
        console.error('加载项目列表失败:', error);
        message.error('加载项目列表失败');
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [value]);

  // 处理项目选择
  const handleChange = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (onChange && project) {
      onChange(projectId, project);
    }
  };

  return (
    <div className="project-selector">
      <Select
        value={value || undefined}
        placeholder={placeholder}
        onChange={handleChange}
        disabled={disabled || loading}
        style={{ width: '100%' }}
        size="large"
        showSearch
        filterOption={(input, option) =>
          (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
        }
        notFoundContent={loading ? <Spin size="small" /> : '暂无项目'}
      >
        {projects.map(project => (
          <Option key={project.id} value={project.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ProjectOutlined />
              <div>
                <div style={{ fontWeight: 500 }}>{project.name}</div>
                {project.description && (
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {project.description}
                  </div>
                )}
              </div>
            </div>
          </Option>
        ))}
      </Select>
      
    </div>
  );
};

export default MobileProjectSelector;
