import {
  apiSuccess,
  WorkTagGroupListQuerySchema,
  WorkTagLookupQuerySchema,
  WorkTagListQuerySchema,
  type WorkTagAttr,
  type WorkTagComponentType,
  type WorkTagGroupListQuery,
  type WorkTagLookupQuery,
  type WorkTagListQuery,
} from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createWorkTagService } from "./work-tag.service.js";

export async function registerWorkTagRoutes(app: FastifyInstance) {
  app.get<{ Querystring: WorkTagLookupQuery }>(
    "/api/server/ai-hosting/work-tags/by-ids",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: WorkTagLookupQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createWorkTagService(app.log).getTagsByIds(
          getUid(request),
          parseTagIds(request.query.tagIds),
        ),
      );
    },
  );

  app.get<{ Querystring: WorkTagGroupListQuery }>(
    "/api/server/ai-hosting/work-tag-groups",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: WorkTagGroupListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createWorkTagService(app.log).listGroups(getUid(request), {
          attr: parseAttr(request.query.attr),
          type: parseComponentType(request.query.type),
        }),
      );
    },
  );

  app.get<{ Querystring: WorkTagListQuery }>(
    "/api/server/ai-hosting/work-tags",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: WorkTagListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createWorkTagService(app.log).listTags(getUid(request), {
          attr: parseAttr(request.query.attr),
          groupId: parseOptionalInteger(request.query.groupId),
          keyword: request.query.keyword?.trim() || undefined,
          page: parseOptionalInteger(request.query.page),
          pageSize: parseOptionalInteger(request.query.pageSize),
          type: parseComponentType(request.query.type),
        }),
      );
    },
  );
}

function parseTagIds(value: string) {
  return [...new Set(value.split(",").map(Number))];
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

function parseOptionalInteger(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseAttr(value: string | undefined): WorkTagAttr | undefined {
  if (value == null) {
    return undefined;
  }

  const parsed = Number(value);
  if (parsed === 1 || parsed === 2) {
    return parsed;
  }

  return undefined;
}

function parseComponentType(value: string | undefined): WorkTagComponentType | undefined {
  if (value == null) {
    return undefined;
  }

  const parsed = Number(value);
  if (parsed === 0 || parsed === 1 || parsed === 10 || parsed === 11 || parsed === 12) {
    return parsed;
  }

  return undefined;
}
