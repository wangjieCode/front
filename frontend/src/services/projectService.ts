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
  configStatus?: string;
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
    const response = await apiClient.get<{ success: boolean; data: any[] }>('/projects');

    if (!response.success) {
      throw new Error('获取项目列表失败');
    }

    return response.data.map((project: any) => ({
      ...project,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt)
    }));
  }

  /**
   * 根据 ID 获取项目信息
   */
  async getProjectById(projectId: string): Promise<Project> {
    const response = await apiClient.get<{ success: boolean; data: Project }>(
      `/projects/${projectId}`
    );

    if (!response.success) {
      throw new Error('获取项目信息失败');
    }

    return response.data;
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

  /**
   * 创建新项目
   */
  async createProject(projectData: {
    projectKey: string;
    projectName: string;
    description?: string;
    repoDir: string;
    worktreeBaseDir: string;
    gitDefaultBranch?: string;
    dockerHost?: string;
  }): Promise<Project> {
    const response = await apiClient.post<{ success: boolean; data: Project; message: string }>(
      '/projects',
      projectData
    );

    if (!response.success) {
      throw new Error(response.message || '创建项目失败');
    }

    return response.data;
  }

  /**
   * 更新项目
   */
  async updateProject(
    projectId: string,
    projectData: {
      projectName?: string;
      description?: string;
      repoDir?: string;
      worktreeBaseDir?: string;
      gitDefaultBranch?: string;
      dockerHost?: string;
      isActive?: boolean;
    }
  ): Promise<Project> {
    const response = await apiClient.put<{ success: boolean; data: Project; message: string }>(
      `/projects/${projectId}`,
      projectData
    );

    if (!response.success) {
      throw new Error(response.message || '更新项目失败');
    }

    return response.data;
  }

  /**
   * 删除项目
   * @param projectId 项目 ID
   * @param force 是否强制删除（硬删除）
   */
  async deleteProject(projectId: string, force: boolean = false): Promise<void> {
    const url = force ? `/projects/${projectId}?force=true` : `/projects/${projectId}`;
    const response = await apiClient.delete<{ success: boolean; message: string }>(url);

    if (!response.success) {
      throw new Error(response.message || '删除项目失败');
    }
  }

  /**
   * 激活项目
   */
  async activateProject(projectId: string): Promise<void> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/projects/${projectId}/activate`
    );

    if (!response.success) {
      throw new Error(response.message || '激活项目失败');
    }
  }
}

// 导出单例
export const projectService = new ProjectService();
