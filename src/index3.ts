/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { createSchema, createYoga } from "graphql-yoga";

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
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
	  type Query {
		pokemon(id: ID!): Pokemon
	  }
		  `,
		resolvers: {
			Query: {
				pokemon: async (_parent, { id }) => {
					const result = await fetch(
						new Request(`https://pokeapi.co/api/v2/pokemon/${id}`),
						{
							cf: {
								// Always cache this fetch regardless of content type
								// for a max of 1 min before revalidating the resource
								cacheTtl: 50,
								cacheEverything: true,
							},
						}
					);
					return await result.json();
				},
			},
		},
	}),
	graphiql: {
		defaultQuery: /* GraphQL */ `
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
	  `,
	},
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return yoga.fetch(request, env);
	},
};
