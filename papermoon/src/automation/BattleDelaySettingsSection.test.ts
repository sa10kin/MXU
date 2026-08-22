import { describe, expect, it } from 'vitest';

import type { ProjectInterface, SelectedTask } from '@/types/interface';
import { generateTaskPipelineOverride } from '@/utils/pipelineOverride';

import { normalizeClickDelay } from './BattleDelaySettingsSection';

describe('click delay settings', () => {
  it('keeps delays inside the supported millisecond range', () => {
    expect(normalizeClickDelay('', '150')).toBe('150');
    expect(normalizeClickDelay('-10', '150')).toBe('0');
    expect(normalizeClickDelay('1200.6', '150')).toBe('1201');
    expect(normalizeClickDelay('70000', '150')).toBe('60000');
    expect(normalizeClickDelay('invalid', '150')).toBe('150');
  });

  it('applies saved global delays to later task pipeline overrides', () => {
    const project: ProjectInterface = {
      interface_version: 2,
      name: 'PaperMoon',
      controller: [{ name: 'adb', type: 'Adb' }],
      resource: [{ name: 'fgo_tw', path: [] }],
      task: [{ name: 'auto_battle', entry: 'Entry' }],
      global_option: ['battle_click_delays'],
      option: {
        battle_click_delays: {
          type: 'input',
          label: 'delays',
          inputs: [
            { name: 'skillPre', default: '150', pipeline_type: 'int' },
            { name: 'skillPost', default: '4000', pipeline_type: 'int' },
          ],
          pipeline_override: {
            PaperMoonBattleStepSkill: {
              pre_delay: '{skillPre}',
              post_delay: '{skillPost}',
            },
          },
        },
      },
    };
    const task: SelectedTask = {
      id: '1',
      taskName: 'auto_battle',
      enabled: true,
      expanded: true,
      optionValues: {},
    };

    expect(
      JSON.parse(
        generateTaskPipelineOverride(task, project, 'adb', 'fgo_tw', {
          battle_click_delays: {
            type: 'input',
            values: { skillPre: '220', skillPost: '3600' },
          },
        }),
      ),
    ).toEqual([{ PaperMoonBattleStepSkill: { pre_delay: 220, post_delay: 3600 } }]);
  });
});
