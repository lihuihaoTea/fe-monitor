import monitor from '@fe-monitor/sdk';

monitor.init({
  endpoint: 'https://api.lihuihao.chat/api/report',
  appId: 'demo-app',
  sampleRate: 1,
  debug: true,
});

console.log('✅ 前端监控 SDK 已初始化');

window.triggerError = function() {
  throw new Error('这是一个测试错误');
};

window.triggerPromiseError = function() {
  Promise.reject(new Error('这是一个 Promise 拒绝错误'));
};

window.triggerResourceError = function() {
  const img = document.createElement('img');
  img.src = 'https://example.com/nonexistent-image-' + Date.now() + '.jpg';
  document.body.appendChild(img);
  
  setTimeout(() => {
    alert('资源加载错误已触发');
  }, 100);
};

window.triggerFetch404 = async function() {
  try {
    await fetch('https://httpstat.us/404');
  } catch (err) {
    console.error('Fetch error:', err);
  }
  alert('Fetch 404 错误已触发');
};

window.triggerXHR500 = function() {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'https://httpstat.us/500');
  xhr.send();
  
  xhr.onload = function() {
    alert('XHR 500 错误已触发');
  };
};

window.triggerNetworkError = async function() {
  try {
    await fetch('http://localhost:9999/nonexistent');
  } catch (err) {
    console.error('Network error:', err);
  }
  alert('网络错误已触发');
};

window.trackCustomEvent = function() {
  monitor.track('button_click', {
    buttonName: '自定义事件按钮',
    timestamp: Date.now(),
  });
  alert('自定义事件已发送');
};
