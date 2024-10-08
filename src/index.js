import { ConfigBuilder } from './SingboxConfigBuilder.js';
import { generateHtml } from './htmlBuilder.js';
import { ClashConfigBuilder } from './ClashConfigBuilder.js';
import { encodeBase64, decodeBase64, GenerateWebPath } from './utils.js';
import { PREDEFINED_RULE_SETS } from './config.js';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  try {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      // Return the HTML form for GET requests
      return new Response(generateHtml('', '', ''), {
        headers: { 'Content-Type': 'text/html' }
      });
    } else if (request.method === 'POST' && url.pathname === '/') {
      const formData = await request.formData();
      const inputString = formData.get('input');
      const selectedRules = formData.getAll('selectedRules');
      const customRuleDomains = formData.getAll('customRuleSite[]');
      const customRuleIPs = formData.getAll('customRuleIP[]');
      const customRuleNames = formData.getAll('customRuleName[]');
      const customRules = customRuleDomains.map((domains, index) => ({
        sites: domains.split(',').map(site => site.trim()),
        ips: customRuleIPs[index].split(',').map(ip => ip.trim()),
        outbound: customRuleNames[index]
      }));

      if (!inputString) {
        return new Response('Missing input parameter', { status: 400 });
      }

      // If no rules are selected, use the default rules
      const rulesToUse = selectedRules.length > 0 ? selectedRules : ['广告拦截', '谷歌服务', '国外媒体', '电报消息'];

      const xrayUrl = `${url.origin}/sub?target=xray&url=${encodeURIComponent(inputString)}`;
      const singboxUrl = `${url.origin}/sub?target=singbox&url=${encodeURIComponent(inputString)}&selectedRules=${encodeURIComponent(JSON.stringify(rulesToUse))}&customRules=${encodeURIComponent(JSON.stringify(customRules))}`;
      const clashUrl = `${url.origin}/sub?target=clash&url=${encodeURIComponent(inputString)}&selectedRules=${encodeURIComponent(JSON.stringify(rulesToUse))}&customRules=${encodeURIComponent(JSON.stringify(customRules))}`;

      return new Response(generateHtml(xrayUrl, singboxUrl, clashUrl), {
        headers: { 'Content-Type': 'text/html' }
      });
    } else if (url.pathname.startsWith('/sub')){

      const target = url.searchParams.has('target') && url.searchParams.get('target') !== '' ? url.searchParams.get('target') : null;

      if (target === 'singbox' || target === 'clash') {
        const inputString = url.searchParams.get('url');
        let selectedRules = url.searchParams.get('selectedRules');
        let customRules = url.searchParams.get('customRules');
  
        if (!inputString) {
          return new Response('Missing config parameter', { status: 400 });
        }
  
        // Deal with predefined rules
        if (PREDEFINED_RULE_SETS[selectedRules]) {
          selectedRules = PREDEFINED_RULE_SETS[selectedRules];
        } else {
          try {
            selectedRules = JSON.parse(decodeURIComponent(selectedRules));
          } catch (error) {
            console.error('Error parsing selectedRules:', error);
            selectedRules = PREDEFINED_RULE_SETS.minimal;
          }
        }
  
        // Deal with custom rules
        try {
          customRules = JSON.parse(decodeURIComponent(customRules));
        } catch (error) {
          console.error('Error parsing customRules:', error);
          customRules = [];
        }
  
        let configBuilder;
        if (target === 'singbox') {
          configBuilder = new ConfigBuilder(inputString, selectedRules, customRules);
        } else {
          configBuilder = new ClashConfigBuilder(inputString, selectedRules, customRules);
        }
  
        const config = await configBuilder.build();
  
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
        // Handle Xray config requests
        const inputString = url.searchParams.get('url');
        const proxylist = inputString.split('\n');
  
        const finalProxyList = [];
  
        for (const proxy of proxylist) {
          console.log(proxy);
          if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
            try {
              const response = await fetch(proxy)
              const text = await response.text();
              let decodedText;
              decodedText = decodeBase64(text.trim());
              // Check if the decoded text needs URL decoding
              if (decodedText.includes('%')) {
                decodedText = decodeURIComponent(decodedText);
              }
              finalProxyList.push(...decodedText.split('\n'));
            } catch (e) {
              console.warn('Failed to fetch the proxy:', e);
            }
          } else {
            finalProxyList.push(proxy);
          }
        }
  
        const finalString = finalProxyList.join('\n');
  
        if (!finalString) {
          return new Response('Missing config parameter', { status: 400 });
        }
  
        return new Response(encodeBase64(finalString), {
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      } else if (url.pathname === '/favicon.ico') {
        return Response.redirect('https://cravatar.cn/avatar/9240d78bbea4cf05fb04f2b86f22b18d?s=160&d=retro&r=g', 301)
      }

    }
    
    return new Response('Not Found', { status: 404 });
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}