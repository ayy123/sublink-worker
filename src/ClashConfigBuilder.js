// 导入必要的模块和依赖
import yaml from 'js-yaml';
import { CLASH_CONFIG, generateRuleSets, generateRules, getOutbounds, PREDEFINED_RULE_SETS } from './config.js';
import { BaseConfigBuilder } from './BaseConfigBuilder.js';
import { DeepCopy } from './utils.js';

// ClashConfigBuilder 类继承自 BaseConfigBuilder
export class ClashConfigBuilder extends BaseConfigBuilder {
    // 构造函数，初始化 ClashConfigBuilder 类
    constructor(inputString, selectedRules, customRules) {
        super(inputString, CLASH_CONFIG); // 调用父类构造函数，初始化基础配置
        this.selectedRules = selectedRules;  // 保存选择的规则集
        this.customRules = customRules;      // 保存自定义规则
    }

    // 添加自定义的代理项
    addCustomItems(customItems) {
        customItems.forEach(item => {
            // 检查 item 是否有 tag 属性且不在已有的代理列表中
            if (item?.tag && !this.config.proxies.some(p => p.name === item.tag)) {
                // 将自定义代理项转换为 Clash 格式，并添加到配置中
                this.config.proxies.push(this.convertToClashProxy(item));
            }
        });
    }

    // 根据选择的规则添加代理组（Selectors）
    addSelectors() {
        let outbounds;
        // 根据选择的规则获取出站规则（outbounds）
        if (typeof this.selectedRules === 'string' && PREDEFINED_RULE_SETS[this.selectedRules]) {
            outbounds = getOutbounds(PREDEFINED_RULE_SETS[this.selectedRules]);
        } else if (this.selectedRules) {
            outbounds = getOutbounds(this.selectedRules);
        } else {
            // 默认使用 minimal 规则集
            outbounds = getOutbounds(PREDEFINED_RULE_SETS.minimal);
        }

        // 获取代理列表的名称
        const proxyList = this.config.proxies.map(proxy => proxy.name);

        // 添加自动选择代理组
        this.config['proxy-groups'].push({
            name: '⚡ 自动选择',
            type: 'url-test',
            proxies: DeepCopy(proxyList), // 使用 DeepCopy 确保原列表不被修改
            url: 'https://www.gstatic.com/generate_204', // 测试 URL
            interval: 300, // 间隔时间
            lazy: false
        });

        // 将 'DIRECT' 和 'REJECT' 添加到代理列表，并添加 '⚡ 自动选择' 作为优先选择
        proxyList.unshift('DIRECT', 'REJECT', '⚡ 自动选择');
        outbounds.unshift('🚀 节点选择');

        // 为每个出站规则创建选择器
        outbounds.forEach(outbound => {
            if (outbound !== '🚀 节点选择') {
                // 为其他节点选择器添加代理
                this.config['proxy-groups'].push({
                    type: "select",
                    name: outbound,
                    proxies: ['🚀 节点选择', ...proxyList]
                });
            } else {
                // 将 '🚀 节点选择' 放在最前面
                this.config['proxy-groups'].unshift({
                    type: "select",
                    name: outbound,
                    proxies: proxyList
                });
            }
        });

        // 如果有自定义规则，将它们也添加为代理组
        if (Array.isArray(this.customRules)) {
            this.customRules.forEach(rule => {
                this.config['proxy-groups'].push({
                    type: "select",
                    name: rule.name,
                    proxies: ['🚀 节点选择', ...proxyList]
                });
            });
        }

        // 添加一个漏网之鱼的选择器，处理匹配的流量
        this.config['proxy-groups'].push({
            type: "select",
            name: "🐟 漏网之鱼",
            proxies: ['🚀 节点选择', ...proxyList]
        });
    }

    // 格式化生成的配置，返回 YAML 格式
    formatConfig() {
        // 生成规则
        const rules = generateRules(this.selectedRules, this.customRules);

        // 将规则列表格式化并添加到配置中
        this.config.rules = rules.flatMap(rule => {
            // 针对不同类型的规则，构造相应的 Clash 规则格式
            const siteRules = rule.site_rules[0] !== '' ? rule.site_rules.map(site => `GEOSITE,${site},${rule.outbound}`) : [];
            const ipRules = rule.ip_rules[0] !== '' ? rule.ip_rules.map(ip => `GEOIP,${ip},${rule.outbound}`) : [];
            const domainSuffixRules = rule.domain_suffix ? rule.domain_suffix.map(suffix => `DOMAIN-SUFFIX,${suffix},${rule.outbound}`) : [];
            const ipCidrRules = rule.ip_cidr ? rule.ip_cidr.map(cidr => `IP-CIDR,${cidr},${rule.outbound}`) : [];
            // 返回合并后的规则
            return [...siteRules, ...ipRules, ...domainSuffixRules, ...ipCidrRules];
        });

        // 添加最终的默认规则
        this.config.rules.push('MATCH,🐟 漏网之鱼');

        // 返回格式化后的 YAML 配置
        return yaml.dump(this.config);
    }

    // 将代理对象转换为 Clash 所需的格式
    convertToClashProxy(proxy) {
        // 根据代理类型，生成相应的 Clash 配置
        switch (proxy.type) {
            case 'shadowsocks':
                return {
                    name: proxy.tag,
                    type: 'ss',
                    server: proxy.server,
                    port: proxy.server_port,
                    cipher: proxy.method,
                    password: proxy.password
                };
            case 'vmess':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    uuid: proxy.uuid,
                    alterId: proxy.alter_id,
                    cipher: proxy.security,
                    tls: proxy.tls?.enabled || false,
                    servername: proxy.tls?.server_name || '',
                    network: proxy.transport?.type || 'tcp',
                    'ws-opts': proxy.transport?.type === 'ws' ? {
                        path: proxy.transport.path,
                        headers: proxy.transport.headers
                    } : undefined
                };
            case 'vless':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    uuid: proxy.uuid,
                    cipher: proxy.security,
                    tls: proxy.tls?.enabled || false,
                    'client-fingerprint': proxy.tls.utls?.fingerprint,
                    servername: proxy.tls?.server_name || '',
                    network: proxy.transport?.type || 'tcp',
                    'ws-opts': proxy.transport?.type === 'ws' ? {
                        path: proxy.transport.path,
                        headers: proxy.transport.headers
                    } : undefined,
                    'reality-opts': proxy.tls.reality?.enabled ? {
                        'public-key': proxy.tls.reality.public_key,
                        'short-id': proxy.tls.reality.short_id,
                    } : undefined,
                    'grpc-opts': proxy.transport?.type === 'grpc' ? {
                        'grpc-mode': 'gun',
                        'grpc-service-name': proxy.transport.service_name,
                    } : undefined,
                    tfo: proxy.tcp_fast_open,
                    'skip-cert-verify': proxy.tls.insecure,
                    'flow': proxy.flow ?? undefined,
                };
            case 'hysteria2':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    obfs: proxy.obfs.type,
                    'obfs-password': proxy.obfs.password,
                    password: proxy.password,
                    auth: proxy.password,
                    'skip-cert-verify': proxy.tls.insecure,
                };
            case 'trojan':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    password: proxy.password,
                    cipher: proxy.security,
                    tls: proxy.tls?.enabled || false,
                    'client-fingerprint': proxy.tls.utls?.fingerprint,
                    servername: proxy.tls?.server_name || '',
                    network: proxy.transport?.type || 'tcp',
                    'ws-opts': proxy.transport?.type === 'ws' ? {
                        path: proxy.transport.path,
                        headers: proxy.transport.headers
                    } : undefined,
                    'reality-opts': proxy.tls.reality?.enabled ? {
                        'public-key': proxy.tls.reality.public_key,
                        'short-id': proxy.tls.reality.short_id,
                    } : undefined,
                    'grpc-opts': proxy.transport?.type === 'grpc' ? {
                        'grpc-mode': 'gun',
                        'grpc-service-name': proxy.transport.service_name,
                    } : undefined,
                    tfo: proxy.tcp_fast_open,
                    'skip-cert-verify': proxy.tls.insecure,
                    'flow': proxy.flow ?? undefined,
                };
            case 'tuic':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    uuid: proxy.uuid,
                    password: proxy.password,
                    'congestion-controller': proxy.congestion,
                    'skip-cert-verify': proxy.tls.insecure,
                    'disable-sni': true,
                    'alpn': proxy.tls.alpn,
                    'sni': proxy.tls.server_name,
                    'udp-relay-mode': 'native',
                };
            default:
                return proxy; // 如果没有特定的转换，返回原始代理对象
        }
    }
}
