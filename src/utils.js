// 定义常量，表示路径的长度
const PATH_LENGTH = 7;

// Base64 解码函数
export function decodeBase64(str) {
	// 使用 atob 函数解码 Base64 字符串
	return atob(str);
}

// Base64 编码函数
export function encodeBase64(str) {
	// 使用 btoa 函数编码字符串为 Base64 格式
	return btoa(str);
}

// 深拷贝函数
export function DeepCopy(obj) {
	// 如果对象是 null 或不是对象类型，则直接返回该值
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}
	// 如果对象是数组，则递归地对数组元素进行深拷贝
	if (Array.isArray(obj)) {
		return obj.map(item => DeepCopy(item));
	}
	// 如果对象是普通对象，则递归地对对象的每个属性进行深拷贝
	const newObj = {};
	for (const key in obj) {
		// 确保该属性是对象自身的属性，而非原型链上的属性
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			// 递归拷贝属性
			newObj[key] = DeepCopy(obj[key]);
		}
	}
	return newObj;
}

// 生成一个随机的 Web 路径
export function GenerateWebPath() {
	// 定义生成路径时可能的字符集
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	// 生成指定长度的路径（路径长度由常量 PATH_LENGTH 确定）
	for (let i = 0; i < PATH_LENGTH; i++) {
		// 从字符集随机选择一个字符并添加到结果中
		result += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return result;
}

// 解析服务器信息（host:port 或 [host]:port 格式）
export function parseServerInfo(serverInfo) {
	let host, port;
	// 如果服务器信息以 '[' 开头，表示使用了 IPv6 地址
	if (serverInfo.startsWith('[')) {
		// 查找 ']' 位置，提取出主机和端口
		const closeBracketIndex = serverInfo.indexOf(']');
		host = serverInfo.slice(1, closeBracketIndex);
		port = serverInfo.slice(closeBracketIndex + 2); // 跳过 ']:'
	} else {
		// 否则，假设是 IPv4 格式，按最后一个 ':' 切分出 host 和 port
		const lastColonIndex = serverInfo.lastIndexOf(':');
		host = serverInfo.slice(0, lastColonIndex);
		port = serverInfo.slice(lastColonIndex + 1);
	}
	// 返回解析后的 host 和 port（port 需要转为整数类型）
	return { host, port: parseInt(port) };
}

// 解析 URL 参数
export function parseUrlParams(url) {
	// 按照 '://' 分割出地址部分和剩余部分
	const [, rest] = url.split('://');
	// 分割地址部分和查询参数部分
	const [addressPart, ...remainingParts] = rest.split('?');
	// 合并剩余部分为参数部分
	const paramsPart = remainingParts.join('?');

	// 分割 URL 中的参数部分和 fragment 部分（# 后面的内容）
	const [paramsOnly, ...fragmentParts] = paramsPart.split('#');
	// 使用 URLSearchParams 解析查询字符串中的参数
	const searchParams = new URLSearchParams(paramsOnly);
	const params = Object.fromEntries(searchParams.entries());

	// 如果 URL 中包含 fragment 部分，则解码并返回
	const name = fragmentParts.length > 0 ? decodeURIComponent(fragmentParts.join('#')) : '';

	// 返回解析后的地址部分、参数和 fragment 部分的名称
	return { addressPart, params, name };
}

// 创建 TLS 配置
export function createTlsConfig(params) {
	// 默认 TLS 配置禁用
	let tls = { enabled: false };
	// 检查传入的安全类型，如果是 xtls、tls 或 reality，则启用 TLS 配置
	if (params.security === 'xtls' || params.security === 'tls' || params.security === 'reality') {
		tls = {
			enabled: true, // 启用 TLS
			server_name: params.sni, // 设置服务器名（SNI）
			insecure: false, // 默认不允许不安全的连接
			utls: {
				enabled: true, // 启用 uTLS
				fingerprint: "chrome" // 设置浏览器指纹为 chrome
			},
		};
		// 如果是 reality 安全类型，添加额外的配置
		if (params.security === 'reality') {
			tls.reality = {
				enabled: true, // 启用 reality 配置
				public_key: params.pbk, // 设置 public_key
				short_id: params.sid, // 设置 short_id
			};
		}
	}
	// 返回生成的 TLS 配置
	return tls;
}

// 创建传输配置
export function createTransportConfig(params) {
	// 返回构建的传输配置对象
	return {
		type: params.type, // 设置传输类型
		path: params.path ?? undefined, // 如果有 path，则添加到配置中
		// 如果有 host，添加 host 到 headers 配置中
		...(params.host && { 'headers': { 'host': params.host } }),
		service_name: params.serviceName ?? undefined, // 如果有 serviceName，则添加到配置中
	};
}
