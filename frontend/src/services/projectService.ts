/**
 * 项目服务
 * 负责项目列表获取和项目信息管理
 */

import { apiClient } from './api';

export interface Project {
  id: string;
  projectKey: string;
  projectName: string;
  description?: string;
  repoDir: string;
  worktreeBaseDir: string;
  gitDefaultBranch: string;
  dockerHost?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 项目服务类
 */
class ProjectService {
  private static readonly SELECTED_PROJECT_KEY = 'selected_project';

  /**
   * 获取所有激活的项目
   */
  async getActiveProjects(): Promise<Project[]> {
    const response = await apiClient.get<{ success: boolean; data: Project[] }>('/projects');

    if (!response.data.success) {
      throw new Error('获取项目列表失败');
    }

    return response.data.data;
  }

  /**
   * 根据 ID 获取项目信息
   */
  async getProjectById(projectId: string): Promise<Project> {
    const response = await apiClient.get<{ success: boolean; data: Project }>(
      `/projects/${projectId}`
    );

    if (!response.data.success) {
      throw new Error('获取项目信息失败');
    }

    return response.data.data;
  }

  /**
   * 保存选中的项目
   */
  setSelectedProject(project: Project): void {
    localStorage.setItem(ProjectService.SELECTED_PROJECT_KEY, JSON.stringify(project));
  }

  /**
   * 获取选中的项目
   */
  getSelectedProject(): Project | null {
    const projectStr = localStorage.getItem(ProjectService.SELECTED_PROJECT_KEY);
    if (!projectStr) return null;

    try {
      return JSON.parse(projectStr);
    } catch {
      return null;
    }
  }

  /**
   * 清除选中的项目
   */
  clearSelectedProject(): void {
    localStorage.removeItem(ProjectService.SELECTED_PROJECT_KEY);
  }
}

// 导出单例
export const projectService = new ProjectService();
