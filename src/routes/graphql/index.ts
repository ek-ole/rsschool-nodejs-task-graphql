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
  GraphQLEnumType,
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

  const MemberTypeType = new GraphQLObjectType({
    name: 'MemberType',
    fields: () => ({
      id: { type: GraphQLString },
      discount: { type: GraphQLFloat },
      postsLimitPerMonth: { type: GraphQLInt },
    }),
  });

  const MemberTypeIdType = new GraphQLEnumType({
    name: 'MemberTypeId',
    values: {
      BASIC: { value: 'BASIC'},
      BUSINESS: { value: 'BUSINESS'}
    },
  });  

  const ProfileType = new GraphQLObjectType({
    name: 'Profile',
    fields: () => ({
      id: { type: GraphQLString },
      isMale: { type: GraphQLBoolean },
      yearOfBirth: { type: GraphQLInt },
      memberType: {
        type: MemberTypeType,
        async resolve(parent: { memberTypeId: string }) {
          if (!parent.memberTypeId) return null;
          return prisma.memberType.findUnique({
            where: { id: parent.memberTypeId },
          });
        },
      },
    }),
  });

  const UserType: GraphQLObjectType = new GraphQLObjectType({
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
      profile: {
        type: ProfileType,
        async resolve(parent: { id: string }) {
          return prisma.profile.findUnique({
            where: { userId: parent.id },
          });
        },
      },
      userSubscribedTo: {
        type: new GraphQLList(UserType),
        async resolve(parent: { id: string }) {
          const subscriptions = await prisma.subscribersOnAuthors.findMany({
            where: { subscriberId: parent.id },
            include: { author: true },
          });
          return subscriptions.map((sub) => sub.author);
        },
      },
      subscribedToUser: {
        type: new GraphQLList(UserType),
        async resolve(parent: { id: string }) {
          const subscribers = await prisma.subscribersOnAuthors.findMany({
            where: { authorId: parent.id },
            include: { subscriber: true },
          });
          return subscribers.map((sub) => sub.subscriber);
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
      post: {
        type: PostType,
        args: {
          id: { type: UUIDType },
        },
        async resolve(_, { id }: { id: string }) {
          return prisma.post.findUnique({
            where: { id },
          });
        },
      },
      profile: {
        type: ProfileType,
        args: {
          id: { type: UUIDType },
        },
        async resolve(_, { id }: { id: string }) {
          return prisma.profile.findUnique({
            where: { id },
          });
        },
      },
      memberType: {
        type: MemberTypeType,
        args: {
          id: { type: MemberTypeIdType },
        },
        async resolve(_, { id }: { id: string }) {
          return prisma.memberType.findUnique({
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
