import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import {
  graphql,
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLInt,
} from 'graphql';
import { UUIDType } from './types/uuid.js';

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

  const ProfileType = new GraphQLObjectType({
    name: 'Profile',
    fields: () => ({
      id: { type: GraphQLString },
      isMale: { type: GraphQLBoolean },
      yearOfBirth: { type: GraphQLInt },
    }),
  });

  const MemberTypeType = new GraphQLObjectType({
    name: 'MemberType',
    fields: () => ({
      id: { type: GraphQLString },
      discount: { type: GraphQLFloat },
      postsLimitPerMonth: { type: GraphQLInt },
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
      },
      profiles: {
        type: new GraphQLList(ProfileType),
        async resolve() {
          const profiles = await prisma.profile.findMany();
          return profiles;
        },
      },
      memberTypes: {
        type: new GraphQLList(MemberTypeType),
        async resolve() {
          const memberTypes = await prisma.memberType.findMany();
          return memberTypes;
        },
      },
      user: {
        type: UserType,
        args: {
          id: { type: UUIDType },
        },
        async resolve(_, { id }: { id: string }) {
          return prisma.user.findUnique({
            where: { id },
          });
        },
      },
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
