local HttpService = game:GetService("HttpService")

local BRIDGE_URL = "wss://scaling-halibut-8080.app.github.dev"

print("[ExplorerRS] Roblox Studio Plugin Initialized")

-- ฟังก์ชันดึงโครงสร้าง Instance Tree
local function getHierarchy(instance)
    local node = {
        id = instance:GetDebugId(),
        name = instance.Name,
        className = instance.ClassName,
        children = {}
    }
    
    for _, child in ipairs(instance:GetChildren()) do
        if not child:IsA("CoreScript") then
            table.insert(node.children, getHierarchy(child))
        end
    end
    
    return node
end

-- ฟังก์ชันดักจับ event เมื่อเกิดการเปลี่ยนแปลงใน Workspace
local function setupListeners()
    game.Workspace.DescendantAdded:Connect(function(descendant)
        print("[ExplorerRS] Added:", descendant.Name, "(" .. descendant.ClassName .. ")")
    end)

    game.Workspace.DescendantRemoving:Connect(function(descendant)
        print("[ExplorerRS] Removed:", descendant.Name)
    end)
end

setupListeners()
print("[ExplorerRS] Event listeners attached successfully.")
