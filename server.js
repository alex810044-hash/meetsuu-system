// server.js - 代理協調系統
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const app = express();

app.use(express.json());

const client = new Anthropic();
const agents = require('./agents');

// 任務數據存儲（實務上應用資料庫）
let taskQueue = {
  品妍: [],
  禾美: [],
  根仔: [],
  固娥: [],
  野鳳: [],
  豐嬌: [],
  盛花: [],
  真妹: []
};

// 代理執行工作的端點
app.post('/agent/work/:agentName', async (req, res) => {
  const { agentName } = req.params;
  const agent = agents[agentName];

  if (!agent) {
    return res.status(404).json({ error: '代理不存在' });
  }

  try {
    // 構建代理的提示詞
    const tasks = taskQueue[agentName] || [];
    const taskSummary = tasks.length > 0
      ? `當前待辦任務：${tasks.join(', ')}`
      : '目前無待辦任務';

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      system: agent.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${taskSummary}\n\n請告訴我你現在應該專注於什麼工作，並提供具體的行動步驟。`
        }
      ]
    });

    const response = message.content[0].text;

    // 記錄代理的工作日誌
    logAgentWork(agentName, response);

    res.json({
      agent: agentName,
      role: agent.role,
      response: response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`${agentName} 代理執行失敗:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 為特定代理分配任務
app.post('/agent/assign-task/:agentName', (req, res) => {
  const { agentName } = req.params;
  const { task } = req.body;

  if (!agents[agentName]) {
    return res.status(404).json({ error: '代理不存在' });
  }

  taskQueue[agentName].push(task);

  res.json({
    message: `任務已分配給 ${agentName}`,
    task: task,
    totalTasks: taskQueue[agentName].length
  });
});

// 跨代理協作端點
app.post('/agent/collaborate', async (req, res) => {
  const { initiator, target, message: collaborationMsg } = req.body;

  if (!agents[initiator] || !agents[target]) {
    return res.status(404).json({ error: '代理不存在' });
  }

  try {
    // 發起者說明需求
    const initiatorMessage = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      system: agents[initiator].systemPrompt,
      messages: [{
        role: "user",
        content: `你需要與${target}（${agents[target].role}）協作。
協作需求：${collaborationMsg}
請生成你要傳達給他們的訊息。`
      }]
    });

    const initiatorText = initiatorMessage.content[0].text;

    // 目標代理回應
    const targetResponse = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      system: agents[target].systemPrompt,
      messages: [{
        role: "user",
        content: `${initiator}（${agents[initiator].role}）給你的訊息：\n\n${initiatorText}\n\n請提供你的回應和協作方案。`
      }]
    });

    const targetText = targetResponse.content[0].text;

    res.json({
      collaboration: {
        initiator: {
          name: initiator,
          role: agents[initiator].role,
          message: initiatorText
        },
        target: {
          name: target,
          role: agents[target].role,
          response: targetText
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 每日工作流程（可用 cron 定時執行）
async function dailyWorkflow() {
  console.log('🌅 每日工作流程開始...\n');

  for (const [agentName, agent] of Object.entries(agents)) {
    console.log(`⏱️ ${agentName}（${agent.role}）工作中...`);

    try {
      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: agent.systemPrompt,
        messages: [{
          role: "user",
          content: `今天是新的一天。${agent.responsibilities.join('、')}是你的責任。\n\n請簡要說明你今天的工作優先順序和計畫。`
        }]
      });

      console.log(`✅ ${agentName}: ${response.content[0].text.substring(0, 100)}...\n`);
      logAgentWork(agentName, response.content[0].text);
    } catch (error) {
      console.error(`❌ ${agentName} 執行失敗:`, error.message);
    }
  }
}

// 記錄工作日誌
function logAgentWork(agentName, workContent) {
  const logDir = './logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${logDir}/${agentName}-${timestamp}.log`;
  fs.writeFileSync(filename, workContent);
}

// 啟動每日工作流程（每天早上9點）
const schedule = require('node-schedule');
schedule.scheduleJob('0 9 * * *', dailyWorkflow);

// 手動觸發工作流程的端點
app.get('/workflow/daily', async (req, res) => {
  await dailyWorkflow();
  res.json({ message: '每日工作流程已執行' });
});

app.listen(3000, () => {
  console.log('🚀 蔬味平生 代理系統運行中，埠號 3000');
});
