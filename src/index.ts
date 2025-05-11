import { createSchema, createYoga } from "graphql-yoga";

export interface Env {
  OPENAI_API_KEY: string;
  DEEPSEEK_API_KEY: string;  // 添加 DeepSeek API Key
  ENVIRONMENT?: string;
  DEFAULT_MODEL?: string;
}

// AI Message 接口（OpenAI 和 DeepSeek 共用）
interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// OpenAI 接口
interface OpenAIChoice {
  message: AIMessage;
  finish_reason: string;
  index: number;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// DeepSeek 接口
interface DeepSeekChoice {
  index: number;
  message: AIMessage;
  finish_reason: string;
}

interface DeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepSeekChoice[];
  usage: DeepSeekUsage;
}

// OpenAI 服务函数
async function callOpenAI(
  messages: AIMessage[], 
  apiKey: string,
  model: string = 'gpt-3.5-turbo'
): Promise<{ content: string; usage?: any }> {
  try {
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData.error?.type === 'insufficient_quota') {
        throw new Error('OpenAI账户余额不足，请充值后再试');
      }
      throw new Error(`OpenAI API error: ${response.status} ${JSON.stringify(errorData)}`);
    }

    const data: OpenAIResponse = await response.json();
    return {
      content: data.choices[0]?.message.content || 'No response',
      usage: data.usage
    };
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    throw error;
  }
}

// DeepSeek 服务函数
async function callDeepSeek(
  messages: AIMessage[], 
  apiKey: string,
  model: string = 'deepseek-chat'
): Promise<{ content: string; usage?: any }> {
  try {
    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured');
    }

    console.log('Calling DeepSeek API...');
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Error:', response.status, errorText);
      throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
    }

    const data: DeepSeekResponse = await response.json();
    console.log('DeepSeek response received');
    
    return {
      content: data.choices[0]?.message.content || 'No response',
      usage: data.usage
    };
  } catch (error) {
    console.error('Error calling DeepSeek:', error);
    throw error;
  }
}

// 通用 AI 调用函数
async function callAI(
  messages: AIMessage[],
  env: Env,
  provider: 'openai' | 'deepseek' = 'openai',
  model?: string
): Promise<{ content: string; usage?: any; provider: string }> {
  try {
    let result;
    
    if (provider === 'deepseek') {
      result = await callDeepSeek(
        messages, 
        env.DEEPSEEK_API_KEY, 
        model || 'deepseek-chat'
      );
    } else {
      result = await callOpenAI(
        messages, 
        env.OPENAI_API_KEY, 
        model || env.DEFAULT_MODEL || 'deepseek-chat'
      );
    }
    
    return {
      ...result,
      provider
    };
  } catch (error: any) {
    // 如果主提供商失败，尝试使用备用提供商
    console.log(`${provider} failed, trying fallback...`);
    
    if (provider === 'openai' && env.DEEPSEEK_API_KEY) {
      console.log('Falling back to DeepSeek...');
      const fallbackResult = await callDeepSeek(
        messages, 
        env.DEEPSEEK_API_KEY, 
        'deepseek-chat'
      );
      return {
        ...fallbackResult,
        provider: 'deepseek'
      };
    } else if (provider === 'deepseek' && env.OPENAI_API_KEY) {
      console.log('Falling back to OpenAI...');
      const fallbackResult = await callOpenAI(
        messages, 
        env.OPENAI_API_KEY, 
        'gpt-3.5-turbo'
      );
      return {
        ...fallbackResult,
        provider: 'openai'
      };
    }
    
    throw error;
  }
}

const yoga = createYoga<Env>({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type PokemonSprites {
        front_default: String!
        front_shiny: String!
        front_female: String!
        front_shiny_female: String!
        back_default: String!
        back_shiny: String!
        back_female: String!
        back_shiny_female: String!
      }
      
      type Pokemon {
        id: ID!
        name: String!
        height: Int!
        weight: Int!
        sprites: PokemonSprites!
      }

      # AI 响应类型
      type AIResponse {
        content: String!
        model: String!
        provider: String!
        usage: Usage
      }
      
      type Usage {
        promptTokens: Int!
        completionTokens: Int!
        totalTokens: Int!
      }

      type Query {
        pokemon(id: ID!): Pokemon
        
        # OpenAI 查询
        chatGPT(prompt: String!, model: String): AIResponse!
        
        # DeepSeek 查询
        deepseek(prompt: String!, model: String): AIResponse!
        
        # 智能 AI 查询（自动选择可用的提供商）
        askAI(prompt: String!, provider: String, model: String): AIResponse!
        
        # Pokemon 相关的 AI 查询
        pokemonInfo(name: String!, provider: String): String!
        comparePokemon(pokemon1: String!, pokemon2: String!, provider: String): String!
      }
    `,
    
    resolvers: {
      Query: {
        pokemon: async (_parent, { id }) => {
          const result = await fetch(
            new Request(`https://pokeapi.co/api/v2/pokemon/${id}`),
            {
              cf: {
                cacheTtl: 50,
                cacheEverything: true,
              },
            }
          );
          return await result.json();
        },
        
        // OpenAI 专用查询
        chatGPT: async (_parent, { prompt, model = 'gpt-3.5-turbo' }, env) => {
          const messages: AIMessage[] = [
            { role: 'user', content: prompt }
          ];
          
          try {
            const result = await callOpenAI(messages, env.OPENAI_API_KEY, model);
            
            return {
              content: result.content,
              model,
              provider: 'openai',
              usage: result.usage ? {
                promptTokens: result.usage.prompt_tokens,
                completionTokens: result.usage.completion_tokens,
                totalTokens: result.usage.total_tokens,
              } : {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              }
            };
          } catch (error: any) {
            throw new Error(`ChatGPT error: ${error.message}`);
          }
        },
        
        // DeepSeek 专用查询
        deepseek: async (_parent, { prompt, model = 'deepseek-chat' }, env) => {
          const messages: AIMessage[] = [
            { role: 'user', content: prompt }
          ];
          
          try {
            const result = await callDeepSeek(messages, env.DEEPSEEK_API_KEY, model);
            
            return {
              content: result.content,
              model,
              provider: 'deepseek',
              usage: result.usage ? {
                promptTokens: result.usage.prompt_tokens,
                completionTokens: result.usage.completion_tokens,
                totalTokens: result.usage.total_tokens,
              } : {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              }
            };
          } catch (error: any) {
            throw new Error(`DeepSeek error: ${error.message}`);
          }
        },
        
        // 智能 AI 查询（自动故障转移）
        askAI: async (_parent, { prompt, provider = 'openai', model }, env) => {
          const messages: AIMessage[] = [
            { role: 'user', content: prompt }
          ];
          
          try {
            const result = await callAI(messages, env, provider as 'openai' | 'deepseek', model);
            
            return {
              content: result.content,
              model: model || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo'),
              provider: result.provider,
              usage: result.usage ? {
                promptTokens: result.usage.prompt_tokens,
                completionTokens: result.usage.completion_tokens,
                totalTokens: result.usage.total_tokens,
              } : {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              }
            };
          } catch (error: any) {
            throw new Error(`AI query failed: ${error.message}`);
          }
        },
        
        // Pokemon 信息查询（支持选择提供商）
        pokemonInfo: async (_parent, { name, provider = 'openai' }, env) => {
          const messages: AIMessage[] = [
            { 
              role: 'system', 
              content: '你是一个Pokemon专家，请用简洁有趣的方式介绍Pokemon。' 
            },
            { 
              role: 'user', 
              content: `请介绍一下${name}这个Pokemon的特点、能力和趣事。` 
            }
          ];
          
          const result = await callAI(messages, env, provider as 'openai' | 'deepseek');
          return result.content;
        },
        
        // Pokemon 比较（支持选择提供商）
        comparePokemon: async (_parent, { pokemon1, pokemon2, provider = 'openai' }, env) => {
          const [data1, data2] = await Promise.all([
            fetch(`https://pokeapi.co/api/v2/pokemon/${pokemon1.toLowerCase()}`).then(r => r.json()),
            fetch(`https://pokeapi.co/api/v2/pokemon/${pokemon2.toLowerCase()}`).then(r => r.json())
          ]);
          
          const messages: AIMessage[] = [
            { 
              role: 'system', 
              content: '你是一个Pokemon专家，请对比分析两个Pokemon的能力。' 
            },
            { 
              role: 'user', 
              content: `
                请对比${pokemon1}和${pokemon2}：
                ${pokemon1}: 身高${data1.height}, 体重${data1.weight}, 类型${data1.types.map((t: any) => t.type.name).join(', ')}
                ${pokemon2}: 身高${data2.height}, 体重${data2.weight}, 类型${data2.types.map((t: any) => t.type.name).join(', ')}
                
                请分析它们的优劣势和战斗特点。
              ` 
            }
          ];
          
          const result = await callAI(messages, env, provider as 'openai' | 'deepseek');
          return result.content;
        },
      },
    },
  }),
  
  graphiql: {
    defaultQuery: /* GraphQL */ `
      # Pokemon 基础查询
      query samplePokeAPIquery {
        pokemon: pokemon(id: 1) {
          id
          name
          height
          weight
          sprites {
            front_shiny
            back_shiny
          }
        }
      }
      
      # ChatGPT 查询
      query askChatGPT {
        chatGPT(prompt: "什么是GraphQL？") {
          content
          model
          provider
        }
      }
      
      # DeepSeek 查询
      query askDeepSeek {
        deepseek(prompt: "什么是GraphQL？") {
          content
          model
          provider
        }
      }
      
      # 智能 AI 查询（自动选择可用的提供商）
      query askSmartAI {
        askAI(prompt: "解释一下人工智能") {
          content
          model
          provider
          usage {
            totalTokens
          }
        }
      }
      
      # Pokemon AI 查询（使用 DeepSeek）
      query pokemonWithDeepSeek {
        info: pokemonInfo(name: "皮卡丘", provider: "deepseek")
        compare: comparePokemon(pokemon1: "皮卡丘", pokemon2: "喷火龙", provider: "deepseek")
      }
    `,
  },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 处理 OPTIONS 请求（CORS）
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    
    // 处理 GraphQL 请求
    const response = await yoga.fetch(request, env);
    
    // 添加 CORS 头
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};