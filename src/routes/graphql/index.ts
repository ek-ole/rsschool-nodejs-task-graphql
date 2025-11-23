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
  GraphQLResolveInfo,
} from 'graphql';
import { UUIDType } from './types/uuid.js';
import depthLimit from 'graphql-depth-limit';
import DataLoader from 'dataloader';
import { MemberType, Post, Prisma, Profile, User } from '@prisma/client';
import { parseResolveInfo, ResolveTree } from 'graphql-parse-resolve-info';

interface GraphQLContext {
  postsLoader: DataLoader<string, Post[]>;
  profilesLoader: DataLoader<string, Profile | null>;
  memberTypesLoader: DataLoader<string, MemberType | null>;
  userSubscribedToLoader: DataLoader<string, User[]>;
  subscribedToUserLoader: DataLoader<string, User[]>;
}

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

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

      const postsLoader = new DataLoader(async (userIds: readonly string[]) => {
        const posts = await prisma.post.findMany({
          where: { authorId: { in: [...userIds] } },
        });
        const postsByUser = userIds.map((userId) =>
          posts.filter((post) => post.authorId === userId),
        );

        return postsByUser;
      });

      const profilesLoader = new DataLoader(async (userIds: readonly string[]) => {
        const profiles = await prisma.profile.findMany({
          where: { userId: { in: [...userIds] } },
        });

        return userIds.map(
          (userId) => profiles.find((profile) => profile.userId === userId) || null,
        );
      });

      const memberTypesLoader = new DataLoader(
        async (memberTypeIds: readonly string[]) => {
          const memberTypes = await prisma.memberType.findMany({
            where: { id: { in: [...memberTypeIds] } },
          });

          return memberTypeIds.map(
            (id) => memberTypes.find((memberType) => memberType.id === id) || null,
          );
        },
      );

      const userSubscribedToLoader = new DataLoader(
        async (userIds: readonly string[]) => {
          const subscriptions = await prisma.subscribersOnAuthors.findMany({
            where: { subscriberId: { in: [...userIds] } },
            include: { author: true },
          });

          return userIds.map((userId) =>
            subscriptions
              .filter((sub) => sub.subscriberId === userId)
              .map((sub) => sub.author),
          );
        },
      );

      const subscribedToUserLoader = new DataLoader(
        async (userIds: readonly string[]) => {
          const subscribers = await prisma.subscribersOnAuthors.findMany({
            where: { authorId: { in: [...userIds] } },
            include: { subscriber: true },
          });

          return userIds.map((userId) =>
            subscribers
              .filter((sub) => sub.authorId === userId)
              .map((sub) => sub.subscriber),
          );
        },
      );

      const context: GraphQLContext = {
        postsLoader,
        profilesLoader,
        memberTypesLoader,
        subscribedToUserLoader,
        userSubscribedToLoader,
      };

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
              return context.memberTypesLoader.load(parent.memberTypeId);
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
              return context.postsLoader.load(parent.id);
            },
          },
          profile: {
            type: ProfileType,
            async resolve(parent: { id: string }) {
              return context.profilesLoader.load(parent.id);
            },
          },
          userSubscribedTo: {
            type: new GraphQLList(UserType),
            async resolve(parent: { id: string }) {
              return context.userSubscribedToLoader.load(parent.id);
            },
          },
          subscribedToUser: {
            type: new GraphQLList(UserType),
            async resolve(parent: { id: string }) {
              return context.subscribedToUserLoader.load(parent.id);
            },
          },
        }),
      });

      const RootQueryType = new GraphQLObjectType({
        name: 'RootQueryType',
        fields: () => ({
          users: {
            type: new GraphQLList(UserType),
            async resolve(_parent, _args, context, info: GraphQLResolveInfo) {
              const parsedInfo = parseResolveInfo(info);

               const fieldsRaw: unknown = parsedInfo?.fieldsByTypeName?.User ?? {};

              const fields =
                fieldsRaw && typeof fieldsRaw === 'object'
                  ? (fieldsRaw as Record<string, ResolveTree>)
                  : {};

              const needUserSubscribedTo = Object.prototype.hasOwnProperty.call(
                fields,
                'userSubscribedTo',
              );

              const needSubscribedToUser = Object.prototype.hasOwnProperty.call(
                fields,
                'subscribedToUser',
              );

              const include: Partial<Prisma.UserInclude> = {};

              if (needUserSubscribedTo) include.userSubscribedTo = true;
              if (needSubscribedToUser) include.subscribedToUser = true;

              const users = await prisma.user.findMany({ include });

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

      const validationRules = [depthLimit(5)];
      const ast = parse(req.body.query);
      const validationErrors = validate(schema, ast, validationRules);
      if (validationErrors.length > 0) {
        return { errors: validationErrors };
      }

      const result = await graphql({
        schema,
        source: req.body.query,
        variableValues: req.body.variables,
        contextValue: context,
      });

      console.log('GraphQL result:', result);
      return result;
    },
  });
};

export default plugin;
