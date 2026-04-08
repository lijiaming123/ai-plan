export type GeneratePlanInput = {
  goal: string;
  deadline: string;
  requirement: string;
  type: 'general' | 'study' | 'work';
};

export type GeneratedTask = {
  id: string;
  title: string;
  order: number;
};

export type GeneratedStage = {
  name: string;
  sortOrder: number;
  tasks: GeneratedTask[];
};

export type GeneratedPlanDraft = {
  stages: GeneratedStage[];
};

export function generatePlanDraft(input: GeneratePlanInput): GeneratedPlanDraft {
  return {
    stages: [
      {
        name: `${input.type === 'study' ? '学习' : '执行'}准备`,
        sortOrder: 1,
        tasks: [
          { id: 'task-1', title: `梳理目标：${input.goal}`, order: 1 },
          { id: 'task-2', title: `明确要求：${input.requirement}`, order: 2 },
        ],
      },
      {
        name: '阶段推进',
        sortOrder: 2,
        tasks: [
          { id: 'task-3', title: '按天拆分行动项', order: 1 },
          { id: 'task-4', title: `围绕截止日期 ${input.deadline} 安排节奏`, order: 2 },
        ],
      },
      {
        name: '复盘收尾',
        sortOrder: 3,
        tasks: [
          { id: 'task-5', title: '汇总完成证据', order: 1 },
          { id: 'task-6', title: '调整下一轮计划', order: 2 },
        ],
      },
    ],
  };
}
