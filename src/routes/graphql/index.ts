import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import {
  graphql,
  GraphQLFloat,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  const PostType = new GraphQLObjectType({
    name: 'Post',
    fields: () => ({
      id: { type: GraphQLString },
      title: { type: GraphQLString },
      content: { type: GraphQLString },
    }),
  });

const UserType = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: GraphQLString },
    name: { type: GraphQLString },
    balance: { type: GraphQLFloat },
    posts: {
      type: new GraphQLList(PostType),
      async resolve(parent: { id: string }) {
        return prisma.post.findMany({
          where: { authorId: parent.id },
        });
      },
    },
  }),
});

  const RootQueryType = new GraphQLObjectType({
    name: 'RootQueryType',
    fields: () => ({
      users: {
        type: new GraphQLList(UserType),
        async resolve() {
          const users = await prisma.user.findMany();
          return users;
        },
      },
      posts: {
        type: new GraphQLList(PostType),
        async resolve() {
          const posts = await prisma.post.findMany();
          return posts;
        },
      }
    }),
  });

  const schema = new GraphQLSchema({
    query: RootQueryType,
  });

  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      ...createGqlResponseSchema,
      response: {
        200: gqlResponseSchema,
      },
    },
    async handler(req) {
      console.log('GraphQL query:', req.body.query);
      const result = await graphql({
        schema,
        source: req.body.query,
        variableValues: req.body.variables,
      });

      console.log('GraphQL result:', result);
      return result;
    },
  });
};

export default plugin;
