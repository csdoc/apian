// 入口文件，负责数据加载和交互
const COLUMN_COUNT = 4; // 可根据屏幕宽度自适应
const PAGE_SIZE = 20;   // 每页多少条

let grid;
let loading;
let endHint;
let columns = [];
let pageStates = {}; // {sourceName: {page: 1, ended: false}}
let sources = [];    // [{name, api, ...}]
let loadingFlag = false;

// 初始化DOM元素
function initElements() {
    grid = document.getElementById('waterfall-grid');
    loading = document.getElementById('loading');
    endHint = document.getElementById('end-hint');
}

function getSelectedSources() {
  // 从 localStorage 获取用户选择的资源站
  const selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '[]');
  const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');
  
  const sources = [];
  
  // 添加内置API源
  selectedAPIs.forEach(apiId => {
    if (apiId.startsWith('custom_')) {
      // 处理自定义API
      const customIndex = apiId.replace('custom_', '');
      const customApi = customAPIs[customIndex];
      if (customApi) {
        sources.push({
          name: customApi.name,
          api: customApi.url,
          detail: customApi.detail,
          isCustom: true,
          sourceCode: apiId
        });
      }
    } else if (API_SITES[apiId]) {
      // 处理内置API
      sources.push({
        name: API_SITES[apiId].name,
        api: API_SITES[apiId].api,
        detail: API_SITES[apiId].detail,
        isCustom: false,
        sourceCode: apiId
      });
    }
  });
  
  return sources;
}

function fetchSourcePage(source, page = 1) {
  const url = `${source.api}${API_CONFIG.search.path}${encodeURIComponent('')}&pg=${page}`;
  return fetch(PROXY_URL + encodeURIComponent(url), {
    headers: API_CONFIG.search.headers
  })
    .then(res => res.json())
    .then(data => {
      if (!data || !data.list) {
        throw new Error('无效的API响应');
      }
      
      // 为每个结果添加源信息
      if (data.list && Array.isArray(data.list)) {
        data.list.forEach(item => {
          item.source_name = source.name;
          item.source_code = source.sourceCode;
        });
      }
      
      return {
        source,
        data,
        page
      };
    })
    .catch(err => {
      console.error(`获取${source.name}数据失败:`, err);
      return {
        source,
        data: null,
        page,
        error: err
      };
    });
}

function createCard(item, sourceName) {
  const card = document.createElement('div');
  card.className = 'card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] h-full shadow-sm hover:shadow-md';
  
  // 安全处理文本内容
  const safeName = (item.vod_name || '').toString()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const safeRemarks = (item.vod_remarks || '').toString()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const safeTypeName = (item.type_name || '').toString()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // 处理图片URL
  const hasCover = item.vod_pic && item.vod_pic.startsWith('http');
  
  // 获取当前源的配置
  const currentSource = sources.find(s => s.name === sourceName);
  
  card.innerHTML = `
    <div class="flex h-full">
      ${hasCover ? `
      <div class="relative flex-shrink-0 search-card-img-container">
        <img src="${item.vod_pic}" alt="${safeName}" 
             class="h-full w-full object-cover transition-transform hover:scale-110" 
             onerror="this.onerror=null; this.src='https://placeholder.im/300x450?text=无封面'; this.classList.add('object-contain');" 
             loading="lazy">
        <div class="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent"></div>
      </div>` : ''}
      
      <div class="p-2 flex flex-col flex-grow">
        <div class="flex-grow">
          <h3 class="font-semibold mb-2 break-words line-clamp-2 ${hasCover ? '' : 'text-center'}" title="${safeName}">${safeName}</h3>
          
          <div class="flex flex-wrap ${hasCover ? '' : 'justify-center'} gap-1 mb-2">
            ${safeTypeName ? 
              `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-blue-500 text-blue-300">
                ${safeTypeName}
              </span>` : ''}
            ${item.vod_year ? 
              `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-purple-500 text-purple-300">
                ${item.vod_year}
              </span>` : ''}
          </div>
          <p class="text-gray-400 line-clamp-2 overflow-hidden ${hasCover ? '' : 'text-center'} mb-2">
            ${safeRemarks || '暂无介绍'}
          </p>
        </div>
        
        <div class="flex justify-between items-center mt-1 pt-1 border-t border-gray-800">
          <div>
            <span class="bg-[#222] text-xs px-1.5 py-0.5 rounded-full">${sourceName}</span>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 点击卡片显示详情
  card.onclick = () => {
    // 使用搜索页面的 showDetails 函数
    if (typeof showDetails === 'function') {
      // 如果是自定义API且有detail参数，或者内置API有detail参数，则使用特殊处理
      if ((currentSource.isCustom && currentSource.detail) || (!currentSource.isCustom && currentSource.detail)) {
        showDetails(item.vod_id, item.vod_name, item.source_code, currentSource.detail);
      } else {
        showDetails(item.vod_id, item.vod_name, item.source_code);
      }
    } else {
      console.error('showDetails 函数未定义');
      // 降级处理：直接跳转到播放页
      const playUrl = item.vod_play_url || '';
      window.location.href = `../watch.html?url=${encodeURIComponent(playUrl)}&source=${item.source_code || ''}`;
    }
  };
  
  return card;
}

function renderItemsToWaterfall(items, sourceName) {
  items.forEach(item => {
    const card = createCard(item, sourceName);
    grid.appendChild(card);
  });
}

function loadInitial() {
  sources = getSelectedSources();
  if (sources.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">请先在设置中选择至少一个资源站</div>';
    hideLoading(); // 确保在没有选择源时隐藏加载提示
    return;
  }
  
  grid.innerHTML = ''; // 清空网格
  pageStates = {};
  showLoading(); // 确保显示加载提示
  endHint.classList.add('hidden');
  
  // 首次加载每个源第一页
  Promise.all(
    sources.map(src => fetchSourcePage(src, 1))
  ).then(results => {
    let hasData = false; // 添加标志来检查是否有任何数据加载成功
    results.forEach(({source, data, page, error}) => {
      if (!pageStates[source.name]) {
        pageStates[source.name] = {page: 1, ended: false};
      }
      
      if (error || !data || !data.list || !data.list.length) {
        pageStates[source.name].ended = true;
        return;
      }
      
      hasData = true; // 如果有任何数据加载成功，设置标志
      renderItemsToWaterfall(data.list, source.name);
      
      if (data.pagecount && data.page >= data.pagecount) {
        pageStates[source.name].ended = true;
      }
    });
    
    hideLoading(); // 在所有数据处理完成后隐藏加载提示
    if (!hasData) {
      // 如果没有任何数据加载成功，显示提示
      grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">暂无数据，请稍后重试</div>';
    }
  }).catch(error => {
    console.error('加载数据失败:', error);
    hideLoading(); // 确保在发生错误时隐藏加载提示
    grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">加载失败，请稍后重试</div>';
  });
}

function tryLoadMore() {
    if (loadingFlag) return;
    
    // 检查是否所有源都已经加载完毕
    const allEnded = sources.every(src => {
        const state = pageStates[src.name];
        return state && state.ended;
    });
    
    if (allEnded) {
        showEndHint(); // 显示到底提示
        return;
    }
    
    loadingFlag = true;
    showLoading(); // 使用专门的函数显示加载提示
    
    // 加载每个还未结束的源的下一页
    const tasks = [];
    sources.forEach(src => {
        const state = pageStates[src.name];
        if (!state || state.ended) return;
        tasks.push(fetchSourcePage(src, state.page + 1));
    });
    
    if (tasks.length === 0) {
        hideLoading(); // 使用专门的函数隐藏加载提示
        showEndHint(); // 显示到底提示
        loadingFlag = false;
        return;
    }
    
    Promise.all(tasks).then(results => {
        let hasNewData = false; // 添加标志来检查是否有新数据加载
        results.forEach(({source, data, page, error}) => {
            const state = pageStates[source.name];
            if (!data || !data.list || !data.list.length) {
                state.ended = true;
                return;
            }
            
            hasNewData = true;
            state.page = page;
            
            renderItemsToWaterfall(data.list, source.name);
            
            if (data.pagecount && page >= data.pagecount) {
                state.ended = true;
            }
        });
        
        hideLoading(); // 使用专门的函数隐藏加载提示
        loadingFlag = false;
        
        // 检查是否所有源都已经加载完毕
        const allEnded = sources.every(src => {
            const state = pageStates[src.name];
            return state && state.ended;
        });
        
        if (allEnded || !hasNewData) {
            showEndHint(); // 显示到底提示
        }
    }).catch(error => {
        console.error('加载更多数据失败:', error);
        hideLoading();
        loadingFlag = false;
        if (typeof window.showToast === 'function') {
            window.showToast('加载更多数据失败，请稍后重试');
        }
    });
}

// 创建瀑布流列
function createWaterfallColumns(count, container) {
  container.innerHTML = '';
  const columns = [];
  
  for (let i = 0; i < count; i++) {
    const column = document.createElement('div');
    column.className = 'waterfall-column';
    column.style.width = `${100 / count}%`;
    container.appendChild(column);
    columns.push(column);
  }
  
  return columns;
}

// 将卡片插入最短的列
function insertCardToShortestColumn(card, columns) {
  let shortestColumn = columns[0];
  let minHeight = shortestColumn.offsetHeight;
  
  for (let i = 1; i < columns.length; i++) {
    const height = columns[i].offsetHeight;
    if (height < minHeight) {
      minHeight = height;
      shortestColumn = columns[i];
    }
  }
  
  shortestColumn.appendChild(card);
}

// 检查是否滚动到底部
function isScrollBottom() {
    // 增加一些容差，提前触发加载
    const threshold = 200; // 距离底部 200px 时就开始加载
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - threshold;
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 关闭详情弹窗
function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// 显示加载提示
function showLoading() {
    if (loading) {
        loading.style.display = 'flex'; // 使用 flex 而不是空字符串
    }
}

// 隐藏加载提示
function hideLoading() {
    if (loading) {
        loading.style.display = 'none';
    }
}

// 显示到底提示
function showEndHint() {
    if (endHint) {
        endHint.classList.remove('hidden');
    }
}

// 隐藏到底提示
function hideEndHint() {
    if (endHint) {
        endHint.classList.add('hidden');
    }
}

// 初始化页面
async function initWaterfall() {
    initElements();
    showLoading();
    try {
        // 获取选中的API源
        sources = getSelectedSources();
        if (!sources || sources.length === 0) {
            if (grid) {
                grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">请先在设置中选择至少一个资源站</div>';
            }
            hideLoading(); // 只在没有选择源时隐藏加载提示
            return;
        }

        // 清空网格并重置状态
        if (grid) {
            grid.innerHTML = '';
        }
        pageStates = {};
        hideEndHint();

        // 加载初始数据
        await loadInitial();
        
        // 添加滚动事件监听器
        window.addEventListener('scroll', debounce(() => {
            if (isScrollBottom() && !loadingFlag) {
                tryLoadMore();
            }
        }, 200)); // 200ms 的防抖时间

    } catch (error) {
        console.error('初始化瀑布流失败:', error);
        if (typeof window.showToast === 'function') {
            window.showToast(error.message || '加载失败，请重试');
        }
        hideLoading(); // 只在发生错误时隐藏加载提示
    }
}

// 页面加载完成后初始化
window.addEventListener('load', () => {
    // 确保所有依赖的脚本都已加载
    if (typeof window.checkPassword === 'function') {
        window.checkPassword().then(() => {
            initWaterfall();
        }).catch(() => {
            // 密码验证失败的处理已在 password.js 中实现
        });
    } else {
        // 如果没有密码验证，直接初始化
        initWaterfall();
    }
});