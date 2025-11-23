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
  GraphQLInputObjectType,
  validate,
  parse,
} from 'graphql';
import { UUIDType } from './types/uuid.js';
import depthLimit from 'graphql-depth-limit';

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
      BASIC: { value: 'BASIC' },
      BUSINESS: { value: 'BUSINESS' },
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

  const MutationType = new GraphQLObjectType({
    name: 'Mutations',
    fields: () => ({
      createUser: {
        type: UserType,
        args: {
          dto: {
            type: new GraphQLInputObjectType({
              name: 'CreateUserInput',
              fields: () => ({
                name: { type: GraphQLString },
                balance: { type: GraphQLFloat },
              }),
            }),
          },
        },
        async resolve(_, { dto }: { dto: { name: string; balance: number } }) {
          return prisma.user.create({
            data: dto,
          });
        },
      },
      createPost: {
        type: PostType,
        args: {
          dto: {
            type: new GraphQLInputObjectType({
              name: 'CreatePostInput',
              fields: () => ({
                title: { type: GraphQLString },
                content: { type: GraphQLString },
                authorId: { type: UUIDType },
              }),
            }),
          },
        },
        async resolve(
          _,
          { dto }: { dto: { title: string; content: string; authorId: string } },
        ) {
          return prisma.post.create({
            data: dto,
          });
        },
      },
      createProfile: {
        type: ProfileType,
        args: {
          dto: {
            type: new GraphQLInputObjectType({
              name: 'CreateProfileInput',
              fields: () => ({
                isMale: { type: GraphQLBoolean },
                yearOfBirth: { type: GraphQLInt },
                userId: { type: UUIDType },
                memberTypeId: { type: MemberTypeIdType },
              }),
            }),
          },
        },
        async resolve(
          _,
          {
            dto,
          }: {
            dto: {
              isMale: boolean;
              yearOfBirth: number;
              userId: string;
              memberTypeId: string;
            };
          },
        ) {
          return prisma.profile.create({
            data: dto,
          });
        },
      },
      changeUser: {
        type: UserType,
        args: {
          id: { type: UUIDType },
          dto: {
            type: new GraphQLInputObjectType({
              name: 'ChangeUserInput',
              fields: () => ({
                name: { type: GraphQLString },
                balance: { type: GraphQLFloat },
              }),
            }),
          },
        },
        async resolve(
          _,
          { id, dto }: { id: string; dto: { name?: string; balance?: number } },
        ) {
          return prisma.user.update({
            where: { id },
            data: dto,
          });
        },
      },
      changePost: {
        type: PostType,
        args: {
          id: { type: UUIDType },
          dto: {
            type: new GraphQLInputObjectType({
              name: 'ChangePostInput',
              fields: () => ({
                title: { type: GraphQLString },
                content: { type: GraphQLString },
              }),
            }),
          },
        },
        async resolve(
          _,
          { id, dto }: { id: string; dto: { title?: string; content?: string } },
        ) {
          return prisma.post.update({
            where: { id },
            data: dto,
          });
        },
      },
      changeProfile: {
        type: ProfileType,
        args: {
          id: { type: UUIDType },
          dto: {
            type: new GraphQLInputObjectType({
              name: 'ChangeProfileInput',
              fields: () => ({
                isMale: { type: GraphQLBoolean },
                yearOfBirth: { type: GraphQLInt },
                memberTypeId: { type: MemberTypeIdType },
              }),
            }),
          },
        },
        async resolve(
          _,
          {
            id,
            dto,
          }: {
            id: string;
            dto: { isMale?: boolean; yearOfBirth?: number; memberTypeId?: string };
          },
        ) {
          return prisma.profile.update({
            where: { id },
            data: dto,
          });
        },
      },
      deleteUser: {
        type: GraphQLString,
        args: {
          id: { type: UUIDType },
        },
        async resolve(_, { id }: { id: string }) {
          await prisma.user.delete({
            where: { id },
          });
          return 'User deleted';
        },
      },
      deletePost: {
        type: GraphQLString,
        args: {
          id: { type: UUIDType },
        },
        async resolve(_, { id }: { id: string }) {
          await prisma.post.delete({
            where: { id },
          });
          return 'Post deleted';
        },
      },
      deleteProfile: {
        type: GraphQLString,
        args: {
          id: { type: UUIDType },
        },
        async resolve(_, { id }: { id: string }) {
          await prisma.profile.delete({
            where: { id },
          });
          return 'Profile deleted';
        },
      },
      subscribeTo: {
        type: GraphQLString,
        args: {
          userId: { type: UUIDType },
          authorId: { type: UUIDType },
        },
        async resolve(_, { userId, authorId }: { userId: string; authorId: string }) {
          await prisma.subscribersOnAuthors.create({
            data: {
              subscriberId: userId,
              authorId: authorId,
            },
          });
          return 'Subscribed';
        },
      },
      unsubscribeFrom: {
        type: GraphQLString,
        args: {
          userId: { type: UUIDType },
          authorId: { type: UUIDType },
        },
        async resolve(_, { userId, authorId }: { userId: string; authorId: string }) {
          await prisma.subscribersOnAuthors.delete({
            where: {
              subscriberId_authorId: {
                subscriberId: userId,
                authorId: authorId,
              },
            },
          });
          return 'Unsubscribed';
        },
      },
    }),
  });

  const schema = new GraphQLSchema({
    query: RootQueryType,
    mutation: MutationType,
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
      const validationRules = [depthLimit(5)];
      const ast = parse(req.body.query);
      const validationErrors = validate(schema, ast, validationRules);
      if (validationErrors.length > 0) {
        return { errors: validationErrors }
      }

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
