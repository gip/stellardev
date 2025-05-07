#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import fs from "fs/promises"
import path from "path"
import { exec as execCb } from "child_process"
import { promisify } from "util"

const exec = promisify(execCb)

const run = async ({ cmd, cwd }: { cmd: string, cwd: string }): Promise<{ code: number, stdout: string, stderr: string }> => {
  try {
    const { stdout, stderr } = await exec(cmd, { cwd, shell: '/bin/zsh' })
    console.error("stdout:", stdout)
    console.error("stderr:", stderr)
    return { code: 0, stdout, stderr }
  } catch (error: any) {
    console.error("stdout:", error.stdout)
    console.error("stderr:", error.stderr)
    return { code: error.code, stdout: error.stdout, stderr: error.stderr }
  }
}

const BASE_DIR = path.join('/Users/gilles/gip/HPD/stellardev', "soroban_instances")
await fs.mkdir(BASE_DIR, { recursive: true })

const server = new Server(
  { name: "stellarSoroban", version: "0.1.0" },
  { capabilities: { tools: {} } }
)

function instancePath(id: string): string {
  return path.join(BASE_DIR, id)
}

function filePath(id: string, name: string): string {
  return path.join(instancePath(id), `contracts/${name}/src/lib.rs`)
}

function wasmPath(id: string, name: string): string {
  return path.join(instancePath(id), `target/wasm32-unknown-unknown/release/${name}.wasm`)
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "initialize",
        description:
          "Initializes a new instance of the Soroban environment used " +
          "to compile and deploy Soroban contracts. A sample smart contract " +
          "is generated during the initialization and may be modified by the " +
          "user.",
        inputSchema: zodToJsonSchema(InitializeArgsSchema),
        //outputSchema: zodToJsonSchema(InitializeOutSchema)
      },
      {
        name: "write_code",
        description: "Write the source code of a contract to the contracts file",
        inputSchema: zodToJsonSchema(WriteCodeArgsSchema),
        //outputSchema: zodToJsonSchema(WriteCodeOutSchema)
      },
      {
        name: "read_code",
        description: "Read the source code of a contract from the contracts file",
        inputSchema: zodToJsonSchema(ReadCodeArgsSchema),
        //outputSchema: zodToJsonSchema(ReadCodeOutSchema)
      },
      {
        name: "compile",
        description: "Compile the contract(s)",
        inputSchema: zodToJsonSchema(CompileArgsSchema),
        //outputSchema: zodToJsonSchema(CompileOutSchema)
      },
      {
        name: "get_tx",
        description:
          "Gets a transaction for deploying a compiled contract to Stellar " +
          "testnet without signing it or submitting it. The transaction will be base64 encoded.",
        inputSchema: zodToJsonSchema(GetTxArgsSchema),
        //outputSchema: zodToJsonSchema(GetTxOutSchema)
      },
      {
        name: "deploy_testnet",
        description:
          "Deploys a contract to the Stellar testnet. An account needs " +
          "to be provided to sign the transaction.",
        inputSchema: zodToJsonSchema(DeployTestnetArgsSchema),
        //outputSchema: zodToJsonSchema(DeployTestnetOutSchema)
      },
      {
        name: "invoke",
        description:
          "Invokes a method on a contract deployed to the Stellar testnet. An account needs " +
          "to be provided to sign the transaction.",
        inputSchema: zodToJsonSchema(InvokeArgsSchema),
        //outputSchema: zodToJsonSchema(DeployTestnetOutSchema)
      }
    ]
  }
})

// Initialize
const InitializeArgsSchema = z.object({
  contractName: z.string(),
})

// Write code
const WriteCodeArgsSchema = z.object({
  instance: z.string(),
  contractName: z.string(),
  content: z.string()
})

// Read code
const ReadCodeArgsSchema = z.object({
  instance: z.string(),
  contractName: z.string()
})

// Compile
const CompileArgsSchema = z.object({
  instance: z.string(),
  contractName: z.string()
})

// Get transaction
const GetTxArgsSchema = z.object({
  instance: z.string(),
  sourceAccount: z.string(),
  contractName: z.string()
})

const DeployTestnetArgsSchema = z.object({
  instance: z.string(),
  contractName: z.string(),
  sourceAccount: z.string()
})

const InvokeArgsSchema = z.object({
  instance: z.string(),
  contractId: z.string(),
  sourceAccount: z.string(),
  method: z.string(),
  arguments: z.array(z.object({
    name: z.string(),
    value: z.string()
  }))
})

server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  try {
    const { name, arguments: args } = params

    switch (name) {
      case "initialize": {
        const parsed = InitializeArgsSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error("Invalid arguments")
        }
        const { contractName } = parsed.data
        const id = uuidv4()
        const dir = instancePath(id)
        await fs.mkdir(dir)
        const res = await run({ cmd: `stellar contract init --name ${contractName} .`, cwd: dir })
        const success = res.code === 0
        if (!success) {
          await fs.rmdir(dir, { recursive: true });
        }
        return {
          content: [{ type: "text", text: `Success: ${success} Instance: ${id}` }],
        }
      }

      case "write_code": {
        const parsed = WriteCodeArgsSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error("Invalid arguments")
        }
        const { instance, contractName, content } = parsed.data
        const targetPath = filePath(instance, contractName)
        await fs.writeFile(targetPath, content, "utf-8")
        return {
          content: [{ type: "text", text: `Success: ${true}` }],
        }
      }

      case "read_code": {
        const parsed = ReadCodeArgsSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error("Invalid arguments")
        }
        const { instance, contractName } = parsed.data
        const targetPath = filePath(instance, contractName)
        const content = await fs.readFile(targetPath, "utf-8")
        const esc0 = "```rust"
        const esc1 = "```"
        return {
          content: [{ type: "text", text: `Success: ${true} \n Content for lib.rs \n${esc0}\n${content}\n${esc1}` }],
        }
      }

      case "compile": {
        const parsed = CompileArgsSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error("Invalid arguments")
        }
        const { instance, contractName } = parsed.data
        const { code, stdout, stderr } = await run({ cmd: `stellar contract build`, cwd: instancePath(instance) })
        return {
          content: [{ type: "text", text: `Success: ${code === 0 ? "true" : "false"} \n ${code === 0 ? stdout : stderr}` }],
        }
      }

      case "get_tx": {
        const parsed = GetTxArgsSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error("Invalid arguments")
        }
        const { instance, contractName, sourceAccount } = parsed.data
        const { code, stdout, stderr } = await run({ cmd: `stellar contract deploy --source ${sourceAccount} --wasm ${wasmPath(instance, contractName)} --network testnet --build-only`, cwd: instancePath(instance) })
        return {
          content: [{ type: "text", text: `Success: ${code === 0 ? "true" : "false"} \n ${code === 0 ? stdout : stderr}` }],
        }
      }

      case "deploy_testnet": {
        const parsed = DeployTestnetArgsSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error("Invalid arguments")
        }
        const { instance, contractName, sourceAccount } = parsed.data
        const { code, stdout, stderr } = await run({ cmd: `stellar contract deploy --source ${sourceAccount} --wasm ${wasmPath(instance, contractName)} --network testnet`, cwd: instancePath(instance) })
        return {
          content: [{ type: "text", text: `Success: ${code === 0 ? "true" : "false"} \n ${code === 0 ? stdout : stderr}` }],
        }
      }

      case "invoke": {
        const parsed = InvokeArgsSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error("Invalid arguments")
        }
        const { instance, contractId, sourceAccount, method, arguments: a } = parsed.data
        const parameters: string = a.map(arg => `--${arg.name} ${arg.value}`).join(" ")
        const { code, stdout, stderr } = await run({ cmd: `stellar contract invoke --source-account ${sourceAccount} --network testnet --id ${contractId} --send=yes -- ${method} ${parameters}`, cwd: instancePath(instance) })
        return {
          content: [{ type: "text", text: `Success: ${code === 0 ? "true" : "false"} \n ${code === 0 ? stdout : stderr}` }],
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true
    }
  }
})

async function runServer() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Secure MCP Filesystem Server running on stdio")
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error)
  process.exit(1)
})