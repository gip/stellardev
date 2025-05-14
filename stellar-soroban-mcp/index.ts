import express from "express"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import server from "./server.js"

const runHttpStream = () => {
  const app = express()
  app.use(express.json())

  app.post('/mcp', async (req, res) => {
    try {
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      res.on('close', () => {
        console.log('Request closed')
        transport.close()
        server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error('Error handling MCP request:', error)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        })
      }
    }
  })

  app.get('/mcp', async (req, res) => {
    console.log('Received GET MCP request')
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    }))
  })

  app.delete('/mcp', async (req, res) => {
    console.log('Received DELETE MCP request')
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    }))
  })

  const port = 36130
  app.listen(port, () => {
    console.error(`MCP Server running on HTTP (port ${port})`)
  })
}

const runStdio = async () => {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("MCP Server running on stdio")
}

const args = process.argv.slice(2)

const main = async () => {
  try {
    if (args.includes("--http")) {
      await runHttpStream()
    } else {
      await runStdio()
    }
  } catch (error) {
    console.error("Fatal error running MCP server:", error)
    process.exit(1)
  }
}

main()