# The procedures subject of the harness of systems (CLI-33, decision D16): the WebSocket client and
# the procedures server of the @procedures/client of this checkout, on Node 24.21.0. The harness
# builds this image from a `build` subject (subject.json), so CI tests each commit with no registry.
#
# The context is the root of a checkout of this repository. The harness copies only the files of
# `image.files` of subject.json into it. Each FROM names a digest, and the root pnpm-lock.yaml
# locks each package.json of the context: the harness refuses a build without them.
#
# Stage 1 builds @procedures/client from the lockfile, then `pnpm deploy --prod` writes the
# package with only its production dependencies to /opt/subject. Stage 2 is that folder with the
# programs of the subject beside the package.json of @procedures/client. Thus `import
# "@procedures/client"` is a self-reference, and `import "ws"` finds the one ws of the package.
#
# The base is the Node image of the procedures subject that the harness ships, by the same digest.
# Thus a difference between the two subjects is a difference of the release, not of Node.
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
ENV CI=true
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# the pnpm version of "packageManager" in the root package.json. Its native binary for musl comes from npm
RUN npm install --global --no-audit --no-fund "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
COPY patches ./patches
COPY packages/client ./packages/client
# a dist folder of the machine that started the harness is not the build of this context
RUN rm -rf packages/client/dist packages/client/*.tsbuildinfo \
  && pnpm install --frozen-lockfile --filter @procedures/client \
  && pnpm --filter @procedures/client build \
  && pnpm --filter @procedures/client deploy --prod /opt/subject

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
WORKDIR /opt/subject
COPY --from=build /opt/subject ./
COPY harness/procedures-subject/lines.mjs harness/procedures-subject/client-ws.mjs harness/procedures-subject/server-ws.mjs ./
