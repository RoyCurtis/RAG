class DOM
{
    public static require(query: string) : Element
    {
        let result = document.querySelector(query);

        if (!result)
            throw new Error(`Required DOM element is missing: '${query}'`);

        return result;
    }
}