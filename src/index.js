// 导入所需的模块和工具函数
import { ConfigBuilder } from './SingboxConfigBuilder.js'; // 导入 Singbox 配置构建器
import { generateHtml } from './htmlBuilder.js'; // 导入 HTML 生成器
import { ClashConfigBuilder } from './ClashConfigBuilder.js'; // 导入 Clash 配置构建器
import { encodeBase64, decodeBase64, GenerateWebPath } from './utils.js'; // 导入工具函数
import { PREDEFINED_RULE_SETS } from './config.js'; // 导入预定义规则集

// 监听 fetch 事件来处理请求
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request)); // 对请求进行响应
})

// 处理所有请求的主函数
async function handleRequest(request) {
  try {
    // 解析请求的 URL
    const url = new URL(request.url);

    // 处理 GET 请求
    if (request.method === 'GET' && url.pathname === '/') {
      // 返回 HTML 表单页面
      return new Response(generateHtml('', '', ''), {
        headers: { 'Content-Type': 'text/html' }
      });

    } else if (request.method === 'POST' && url.pathname === '/') {
      // 处理表单提交的 POST 请求
      const formData = await request.formData(); // 获取表单数据
      const inputString = formData.get('input'); // 获取输入的字符串
      const selectedRules = formData.getAll('selectedRules'); // 获取选中的规则
      const customRuleDomains = formData.getAll('customRuleSite[]'); // 获取自定义规则域名
      const customRuleIPs = formData.getAll('customRuleIP[]'); // 获取自定义规则 IP
      const customRuleNames = formData.getAll('customRuleName[]'); // 获取自定义规则名称

      // 将自定义规则解析为对象
      const customRules = customRuleDomains.map((domains, index) => ({
        sites: domains.split(',').map(site => site.trim()), // 分割并去除空格
        ips: customRuleIPs[index].split(',').map(ip => ip.trim()), // 分割并去除空格
        outbound: customRuleNames[index] // 自定义规则名称
      }));

      // 如果输入字符串为空，返回 400 错误
      if (!inputString) {
        return new Response('Missing input parameter', { status: 400 });
      }

      // 如果没有选择规则，则使用默认规则
      const rulesToUse = selectedRules.length > 0 ? selectedRules : ['广告拦截', '谷歌服务', '国外媒体', '电报消息'];

      // 构建生成链接的 URL
      const xrayUrl = `${url.origin}/sub?target=xray&url=${encodeURIComponent(inputString)}`;
      const singboxUrl = `${url.origin}/sub?target=singbox&url=${encodeURIComponent(inputString)}&selectedRules=${encodeURIComponent(JSON.stringify(rulesToUse))}&customRules=${encodeURIComponent(JSON.stringify(customRules))}`;
      const clashUrl = `${url.origin}/sub?target=clash&url=${encodeURIComponent(inputString)}&selectedRules=${encodeURIComponent(JSON.stringify(rulesToUse))}&customRules=${encodeURIComponent(JSON.stringify(customRules))}`;

      // 返回包含生成链接的 HTML 页面
      return new Response(generateHtml(xrayUrl, singboxUrl, clashUrl), {
        headers: { 'Content-Type': 'text/html' }
      });

    } else if (url.pathname.startsWith('/sub')) {
      // 处理以 "/sub" 开头的请求

      // 获取查询参数中的 target 值
      const target = url.searchParams.has('target') && url.searchParams.get('target') !== '' ? url.searchParams.get('target') : null;

      if (target === 'singbox' || target === 'clash') {
        // 如果 target 是 singbox 或 clash，构建相应的配置

        const inputString = url.searchParams.get('url'); // 获取输入的 URL
        let selectedRules = url.searchParams.get('selectedRules'); // 获取选中的规则
        let customRules = url.searchParams.get('customRules'); // 获取自定义规则

        // 如果输入字符串为空，返回 400 错误
        if (!inputString) {
          return new Response('Missing config parameter', { status: 400 });
        }

        // 处理预定义规则集
        if (PREDEFINED_RULE_SETS[selectedRules]) {
          selectedRules = PREDEFINED_RULE_SETS[selectedRules]; // 使用预定义的规则集
        } else {
          // 尝试解析选中的规则
          try {
            selectedRules = JSON.parse(decodeURIComponent(selectedRules)); // 解码并解析选中的规则
          } catch (error) {
            console.error('Error parsing selectedRules:', error);
            selectedRules = PREDEFINED_RULE_SETS.minimal; // 如果解析失败，则使用默认规则
          }
        }

        // 处理自定义规则
        try {
          customRules = JSON.parse(decodeURIComponent(customRules)); // 解码并解析自定义规则
        } catch (error) {
          console.error('Error parsing customRules:', error);
          customRules = []; // 如果解析失败，则使用空数组
        }

        // 根据 target 创建配置构建器
        let configBuilder;
        if (target === 'singbox') {
          configBuilder = new ConfigBuilder(inputString, selectedRules, customRules);
        } else {
          configBuilder = new ClashConfigBuilder(inputString, selectedRules, customRules);
        }

        // 构建配置
        const config = await configBuilder.build();

        // 返回配置文件，Singbox 返回 JSON 格式，Clash 返回 YAML 格式
        return new Response(
          target === 'singbox' ? JSON.stringify(config, null, 2) : config,
          {
            headers: {
              'content-type': target === 'singbox'
                ? 'application/json; charset=utf-8'
                : 'text/yaml; charset=utf-8'
            }
          }
        );

      } else if (target === 'xray') {
        // 处理 Xray 配置请求

        const inputString = url.searchParams.get('url'); // 获取输入的 URL
        const proxylist = inputString.split('\n'); // 将输入的 URL 按行分割

        const finalProxyList = [];

        // 遍历每个代理，尝试从 URL 获取并解析
        for (const proxy of proxylist) {
          console.log(proxy);
          if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
            try {
              const response = await fetch(proxy); // 获取代理的内容
              const text = await response.text(); // 解析返回的文本
              let decodedText;
              decodedText = decodeBase64(text.trim()); // 解码 Base64 内容
              // 如果解码后的文本包含 URL 编码字符，则进行解码
              if (decodedText.includes('%')) {
                decodedText = decodeURIComponent(decodedText);
              }
              finalProxyList.push(...decodedText.split('\n')); // 分割并加入到最终代理列表
            } catch (e) {
              console.warn('Failed to fetch the proxy:', e); // 如果获取失败，则警告
            }
          } else {
            finalProxyList.push(proxy); // 不是 URL 的代理直接加入
          }
        }

        // 将最终代理列表合并为字符串
        const finalString = finalProxyList.join('\n');

        // 如果没有代理内容，返回 400 错误
        if (!finalString) {
          return new Response('Missing config parameter', { status: 400 });
        }

        // 返回 Base64 编码的代理列表
        return new Response(encodeBase64(finalString), {
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      } else if (url.pathname === '/favicon.ico') {
        // 处理 favicon 请求，重定向到指定的头像图标
        return Response.redirect('https://cravatar.cn/avatar/9240d78bbea4cf05fb04f2b86f22b18d?s=160&d=retro&r=g', 301);
      }

    }

    // 如果请求的路径不匹配任何已知的路径，返回 404 错误
    return new Response('Not Found', { status: 404 });

  } catch (error) {
    console.error('Error processing request:', error); // 打印错误日志
    return new Response('Internal Server Error', { status: 500 }); // 返回 500 错误
  }
}
