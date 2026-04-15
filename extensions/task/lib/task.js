module.exports = async function({workspace, taskUtil}) {
	if (!taskUtil || !taskUtil.resourceFactory || !taskUtil.resourceFactory.createResource) {
		throw new Error("Expected TaskUtil resourceFactory support from a specVersion 3.0 task interface.");
	}

	const {createResource} = taskUtil.resourceFactory;
	await workspace.write(createResource({
		path: "/custom-task-marker.txt",
		string: "ui5-cli-on-bun-task\n"
	}));
};
