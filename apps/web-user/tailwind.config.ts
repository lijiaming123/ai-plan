import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#13ec5b',
        'background-light': '#f6f8f6',
        'background-dark': '#102216',
      },
      fontFamily: {
        display: ['Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        /** 计划主页等偏「生活化」界面：圆润易读 */
        plan: ['"Plus Jakarta Sans"', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        /** 模板库等编辑风标题：柔和衬线，与 plan 正文混搭 */
        editorial: ['Fraunces', 'Georgia', 'Noto Serif SC', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
